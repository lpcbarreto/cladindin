"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionClient, isoDate, uuid } from "@/lib/actions";
import { ImportError, MAX_FILES, parseBankFile, type ParsedStatement } from "@/lib/importers";
import { classifyRows, type ExistingTx } from "@/lib/importers/match";
import { normalizeDescription, sha256Hex, withFingerprints } from "@/lib/importers/normalize";
import { addDays } from "@/lib/finance/dates";
import { rateLimit } from "@/lib/rate-limit";
import type { CommitResult, PreviewFile, PreviewResult, PreviewRow, PreviewStatement } from "./types";

const CARD_PAYMENT_RE = /PAGAMENTO|PGTO|PAG FATURA|PAGTO/;

/** Etapa 1–3 do assistente: lê os arquivos, detecta a conta e monta a pré-visualização. */
export async function previewImport(form: FormData): Promise<PreviewResult> {
  const workspaceId = uuid.safeParse(form.get("workspaceId"));
  if (!workspaceId.success) return { ok: false, message: "Workspace inválido." };
  const { supabase, user } = await getActionClient();
  if (!rateLimit(`preview:${user.id}`, 30, 60_000)) {
    return { ok: false, message: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." };
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, message: "Selecione ao menos um arquivo." };
  if (files.length > MAX_FILES) return { ok: false, message: `Envie no máximo ${MAX_FILES} arquivos por vez.` };

  const ws = workspaceId.data;
  const [{ data: links }, { data: accounts }] = await Promise.all([
    supabase.from("account_import_links").select("account_id, bank_id, external_account_id").eq("workspace_id", ws),
    supabase.from("accounts").select("id, type").eq("workspace_id", ws).eq("archived", false),
  ]);
  const accountIds = new Set((accounts ?? []).map((a) => a.id));
  const categoryHints = await loadCategoryHints(supabase, ws);

  const out: PreviewFile[] = [];
  for (const [fi, file] of files.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileHash = sha256Hex(bytes);
    const fileName = file.name.slice(0, 200);
    try {
      const parsed = parseBankFile(fileName, bytes);
      const statements: PreviewStatement[] = [];
      for (const [si, st] of parsed.statements.entries()) {
        const key = `${fi}:${si}`;
        const mapped = form.get(`map:${key}`);
        const linked = (links ?? []).find(
          (l) => l.external_account_id === st.accountId && (l.bank_id || "") === (st.bankId ?? ""),
        )?.account_id;
        const accountId =
          typeof mapped === "string" && accountIds.has(mapped) ? mapped : linked && accountIds.has(linked) ? linked : null;
        statements.push(await buildStatement(supabase, ws, key, st, accountId, fileHash, categoryHints));
      }
      out.push({ fileName, fileHash, parser: parsed.parser, warnings: parsed.warnings, statements });
    } catch (e) {
      const err = e instanceof ImportError ? { message: e.message, hint: e.hint } : { message: "Não foi possível ler o arquivo." };
      out.push({ fileName, fileHash, parser: "-", warnings: [], statements: [], error: err });
    }
  }
  return { ok: true, files: out };
}

type Supabase = Awaited<ReturnType<typeof getActionClient>>["supabase"];

/** Descrição normalizada → última categoria usada (sugestão até termos regras na Fase 6). */
async function loadCategoryHints(supabase: Supabase, ws: string) {
  const { data } = await supabase
    .from("transactions")
    .select("description, statement_description, category_id")
    .eq("workspace_id", ws)
    .not("category_id", "is", null)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(2000);
  const map = new Map<string, string>();
  for (const t of data ?? []) {
    for (const d of [t.statement_description, t.description]) {
      const k = d ? normalizeDescription(d) : "";
      if (k && !map.has(k)) map.set(k, t.category_id as string);
    }
  }
  return map;
}

async function buildStatement(
  supabase: Supabase,
  ws: string,
  key: string,
  st: ParsedStatement,
  accountId: string | null,
  fileHash: string,
  hints: Map<string, string>,
): Promise<PreviewStatement> {
  const label =
    st.source === "credit_card"
      ? `Cartão ${st.accountId ?? "sem número"}`
      : `Banco ${st.bankId ?? "?"} · conta ${st.accountId ?? "?"}${st.branchId ? ` · ag. ${st.branchId}` : ""}`;
  const base: PreviewStatement = {
    key,
    source: st.source,
    bankId: st.bankId,
    externalAccountId: st.accountId,
    label,
    startDate: st.startDate,
    endDate: st.endDate,
    balance: st.balance,
    accountId,
    sameFileImportedAt: null,
    rows: null,
  };
  if (!accountId) return base;

  const { data: prev } = await supabase
    .from("import_batches")
    .select("created_at")
    .eq("account_id", accountId)
    .eq("file_hash", fileHash)
    .is("undone_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const incoming = withFingerprints(accountId, st.transactions).map((t, index) => ({ ...t, index }));
  const dates = incoming.map((t) => t.date).sort();
  let existing: ExistingTx[] = [];
  if (dates.length) {
    const from = addDays(dates[0], -10);
    const to = addDays(dates[dates.length - 1], 10);
    const { data } = await supabase
      .from("transactions")
      .select("id, direction, amount_cents, description, status, due_date, paid_date, external_id, fingerprint, origin")
      .eq("workspace_id", ws)
      .eq("account_id", accountId)
      .is("deleted_at", null)
      .or(`and(due_date.gte.${from},due_date.lte.${to}),and(paid_date.gte.${from},paid_date.lte.${to})`)
      .limit(5000);
    // FITID/fingerprint fora da janela de datas (banco que muda a data do lançamento), em lotes
    const byIds: NonNullable<typeof data> = [];
    const quote = (s: string) => `"${s.replace(/["\\]/g, "")}"`;
    for (let i = 0; i < incoming.length; i += 150) {
      const chunk = incoming.slice(i, i + 150);
      const fitids = chunk.map((t) => t.externalId).filter(Boolean) as string[];
      const filters = [`fingerprint.in.(${chunk.map((t) => t.fingerprint).join(",")})`];
      if (fitids.length) filters.push(`external_id.in.(${fitids.map(quote).join(",")})`);
      const { data: found } = await supabase
        .from("transactions")
        .select("id, direction, amount_cents, description, status, due_date, paid_date, external_id, fingerprint, origin")
        .eq("account_id", accountId)
        .is("deleted_at", null)
        .or(filters.join(","));
      byIds.push(...(found ?? []));
    }
    const all = new Map([...(data ?? []), ...byIds].map((t) => [t.id, t]));
    existing = [...all.values()].map((t) => ({
      id: t.id,
      date: t.status === "paid" && t.paid_date ? t.paid_date : t.due_date,
      amountCents: t.direction * t.amount_cents,
      description: t.description,
      status: t.status,
      externalId: t.external_id,
      fingerprint: t.fingerprint,
      origin: t.origin,
    }));
  }

  const statuses = classifyRows(incoming, existing);
  const rows: PreviewRow[] = incoming.map((t) => {
    const status = statuses.get(t.index) ?? { kind: "new" as const };
    let note: string | null = null;
    let include = status.kind === "new" || status.kind === "reconcile";
    const norm = normalizeDescription(t.description);
    if (st.source === "credit_card" && t.amountCents > 0 && CARD_PAYMENT_RE.test(norm)) {
      include = false;
      note = "Pagamento da fatura: registre como transferência da conta corrente para o cartão, não como receita.";
    }
    return {
      index: t.index,
      date: t.date,
      amountCents: t.amountCents,
      description: t.description,
      externalId: t.externalId,
      fingerprint: t.fingerprint,
      status,
      suggestedCategoryId: hints.get(norm) ?? null,
      include: status.kind === "imported" ? false : include,
      note,
    };
  });
  return { ...base, rows, sameFileImportedAt: prev?.created_at ?? null };
}

const commitSchema = z.object({
  workspaceId: uuid,
  accountId: uuid,
  fileName: z.string().min(1).max(200),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  parser: z.string().max(40),
  totalRows: z.number().int().min(0).max(100_000),
  bankId: z.string().max(40).nullable(),
  externalAccountId: z.string().max(80).nullable(),
  balance: z.object({ amountCents: z.number().int(), date: isoDate }).nullable(),
  rows: z
    .array(
      z.object({
        date: isoDate,
        amountCents: z.number().int().refine((v) => v !== 0),
        description: z.string().trim().min(1).max(300),
        externalId: z.string().max(255).nullable(),
        fingerprint: z.string().regex(/^[a-f0-9]{40}$/),
        categoryId: uuid.nullable(),
        reconcileTxId: uuid.nullable(),
      }),
    )
    .max(20_000),
});

/** Etapa 4: grava as linhas escolhidas numa única transação no banco. */
export async function commitImport(input: z.input<typeof commitSchema>): Promise<CommitResult> {
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Dados da importação inválidos. Recomece o envio do arquivo." };
  const v = parsed.data;
  const { supabase, user } = await getActionClient();
  if (!rateLimit(`commit:${user.id}`, 20, 60_000)) return { ok: false, message: "Muitas importações seguidas. Aguarde um minuto." };

  const { data, error } = await supabase.rpc("commit_import", {
    p_workspace_id: v.workspaceId,
    p_account_id: v.accountId,
    p_file_name: v.fileName,
    p_file_hash: v.fileHash,
    p_parser: v.parser,
    p_total_rows: v.totalRows,
    p_balance_cents: v.balance?.amountCents ?? null,
    p_balance_date: v.balance?.date ?? null,
    p_bank_id: v.bankId,
    p_external_account_id: v.externalAccountId,
    p_rows: v.rows.map((r) => ({
      date: r.date,
      amount_cents: r.amountCents,
      description: r.description,
      external_id: r.externalId,
      fingerprint: r.fingerprint,
      category_id: r.categoryId,
      reconcile_tx_id: r.reconcileTxId,
    })),
  });
  if (error || !data) {
    if (error?.code === "P0001") return { ok: false, message: error.message };
    if (error?.code === "PGRST202") {
      return { ok: false, message: "O banco ainda não tem a migration de importação (Fase 3). Aplique-a no Supabase e tente de novo." };
    }
    console.error("commit_import falhou:", error?.code, error?.message);
    return { ok: false, message: "Não foi possível gravar a importação." };
  }

  let balanceCheck: { statement: number; system: number; date: string } | null = null;
  if (v.balance) {
    const { data: sys } = await supabase.rpc("account_balance_at", { p_account_id: v.accountId, p_date: v.balance.date });
    if (typeof sys === "number") balanceCheck = { statement: v.balance.amountCents, system: sys, date: v.balance.date };
  }
  revalidatePath(`/w/${v.workspaceId}`, "layout");
  const d = data as { batch_id: string; new: number; duplicates: number; reconciled: number };
  return { ok: true, batchId: d.batch_id, created: d.new, duplicates: d.duplicates, reconciled: d.reconciled, balanceCheck };
}

export async function undoImport(form: FormData) {
  const v = z.object({ workspaceId: uuid, batchId: uuid }).parse(Object.fromEntries(form));
  const { supabase } = await getActionClient();
  await supabase.rpc("undo_import", { p_batch_id: v.batchId });
  revalidatePath(`/w/${v.workspaceId}`, "layout");
}
