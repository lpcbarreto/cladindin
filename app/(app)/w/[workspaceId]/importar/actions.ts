"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionClient, isoDate, uuid } from "@/lib/actions";
import { ImportError, loadBankFile, MAX_FILES, type ParsedTransaction } from "@/lib/importers";
import { applyMapping, guessMapping, type CsvMapping } from "@/lib/importers/csv/parse";
import { classifyRows, type ExistingTx } from "@/lib/importers/match";
import { normalizeDescription, sha256Hex, withFingerprints } from "@/lib/importers/normalize";
import { detectInstallment, invoiceDatesForPurchase } from "@/lib/finance/installments";
import { addDays } from "@/lib/finance/dates";
import { rateLimit } from "@/lib/rate-limit";
import type { CommitResult, CsvInfo, PreviewFile, PreviewRow, PreviewStatement } from "./types";

const CARD_PAYMENT_RE = /\b(PAGAMENTO|PGTO|PAGTO|PAG FATURA)\b/;
const BANK_INVOICE_PAYMENT_RE = /\b(FATURA|CARTAO CRED|CART CRED|PAG CARTAO|PAGTO CARTAO)\b/;

// Palavra na descrição → nome de categoria padrão (encargos de cartão)
const KEYWORD_CATEGORIES: [RegExp, string][] = [
  [/\bIOF\b/, "IOF"],
  [/\b(JUROS|ENCARGOS|ROTATIVO)\b/, "Juros"],
  [/\bMULTA\b/, "Juros e multas"],
  [/\b(ANUIDADE|TARIFA)\b/, "Tarifas bancárias"],
];

type Supabase = Awaited<ReturnType<typeof getActionClient>>["supabase"];
type Account = { id: string; type: string; closing_day: number | null; due_day: number | null };
type IncomingTx = ParsedTransaction & { installment?: string | null; cardholder?: string | null };

const csvMappingSchema = z.object({
  date: z.number().int().min(0),
  description: z.number().int().min(0),
  amount: z.number().int().min(0).nullable(),
  debit: z.number().int().min(0).nullable(),
  credit: z.number().int().min(0).nullable(),
  installment: z.number().int().min(0).nullable(),
  cardholder: z.number().int().min(0).nullable(),
  dateFormat: z.enum(["dmy", "ymd", "mdy"]),
  invert: z.boolean(),
  headerRow: z.number().int().min(0),
});

/** Etapas 1–3 do assistente: lê os arquivos, detecta a conta e monta a pré-visualização. */
export async function previewImport(form: FormData): Promise<{ ok: true; files: PreviewFile[] } | { ok: false; message: string }> {
  const workspaceId = uuid.safeParse(form.get("workspaceId"));
  if (!workspaceId.success) return { ok: false, message: "Workspace inválido." };
  const { supabase, user } = await getActionClient();
  if (!rateLimit(`preview:${user.id}`, 40, 60_000)) {
    return { ok: false, message: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." };
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, message: "Selecione ao menos um arquivo." };
  if (files.length > MAX_FILES) return { ok: false, message: `Envie no máximo ${MAX_FILES} arquivos por vez.` };

  const ws = workspaceId.data;
  const [{ data: links }, { data: accountRows }, { data: templates }, { data: cats }] = await Promise.all([
    supabase.from("account_import_links").select("account_id, bank_id, external_account_id").eq("workspace_id", ws),
    supabase.from("accounts").select("id, type, credit_cards!credit_cards_account_id_fkey(closing_day, due_day)").eq("workspace_id", ws).eq("archived", false),
    supabase.from("import_templates").select("name, header_signature, account_id, config").eq("workspace_id", ws),
    supabase.from("categories").select("id, name, kind").eq("workspace_id", ws).eq("archived", false),
  ]);
  const accounts = new Map<string, Account>(
    (accountRows ?? []).map((a) => {
      const cc = (Array.isArray(a.credit_cards) ? a.credit_cards[0] : a.credit_cards) as { closing_day: number; due_day: number } | null;
      return [a.id, { id: a.id, type: a.type, closing_day: cc?.closing_day ?? null, due_day: cc?.due_day ?? null }];
    }),
  );
  const hints = await loadCategoryHints(supabase, ws);
  const keywordCats = KEYWORD_CATEGORIES.flatMap(([re, name]) => {
    const c = (cats ?? []).find((x) => x.kind === "expense" && x.name.toLowerCase() === name.toLowerCase());
    return c ? [[re, c.id] as [RegExp, string]] : [];
  });

  const out: PreviewFile[] = [];
  for (const [fi, file] of files.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileHash = sha256Hex(bytes);
    const fileName = file.name.slice(0, 200);
    try {
      const loaded = await loadBankFile(fileName, bytes);
      const mapped = (key: string) => {
        const v = form.get(`map:${key}`);
        return typeof v === "string" && accounts.has(v) ? v : null;
      };
      const statements: PreviewStatement[] = [];
      const warnings: string[] = [];
      let parser: string = loaded.kind;

      if (loaded.kind === "ofx") {
        warnings.push(...loaded.result.warnings);
        for (const [si, st] of loaded.result.statements.entries()) {
          const key = `${fi}:${si}`;
          const linked = (links ?? []).find(
            (l) => l.external_account_id === st.accountId && (l.bank_id || "") === (st.bankId ?? ""),
          )?.account_id;
          const accountId = mapped(key) ?? (linked && accounts.has(linked) ? linked : null);
          const label =
            st.source === "credit_card"
              ? `Cartão ${st.accountId ?? "sem número"}`
              : `Banco ${st.bankId ?? "?"} · conta ${st.accountId ?? "?"}${st.branchId ? ` · ag. ${st.branchId}` : ""}`;
          statements.push(
            await buildStatement(supabase, ws, form, accounts, hints, keywordCats, fileHash, {
              key,
              kind: "ofx",
              source: st.source,
              bankId: st.bankId,
              externalAccountId: st.accountId,
              label,
              startDate: st.startDate,
              endDate: st.endDate,
              balance: st.balance,
              accountId,
              declaredTotalCents: st.source === "credit_card" && st.balance ? Math.abs(st.balance.amountCents) : null,
              pdfDueDate: null,
              csv: null,
              transactions: st.transactions,
            }),
          );
        }
      } else if (loaded.kind === "csv") {
        const key = `${fi}:0`;
        const template = (templates ?? []).find((t) => t.header_signature === loaded.signature);
        const custom = form.get(`csvmap:${key}`);
        let mapping: CsvMapping;
        let preset: string | null = null;
        if (typeof custom === "string") mapping = csvMappingSchema.parse(JSON.parse(custom));
        else if (template) mapping = csvMappingSchema.parse(template.config);
        else ({ mapping, preset } = guessMapping(loaded.table));
        const valid = mapping.date >= 0 && mapping.description >= 0 && (mapping.amount !== null || mapping.debit !== null || mapping.credit !== null);
        const parsed = valid ? applyMapping(loaded.table, mapping) : { transactions: [], skipped: loaded.table.rows.length };
        if (parsed.skipped) warnings.push(`${parsed.skipped} linha(s) ignorada(s) por data ou valor ilegível (saldos e totais também são ignorados).`);
        const csv: CsvInfo = {
          headers: loaded.table.headers,
          sample: loaded.table.rows.slice(0, 5),
          mapping,
          preset,
          signature: loaded.signature,
          template: template?.name ?? null,
          skipped: parsed.skipped,
        };
        const templateAccount = template?.account_id && accounts.has(template.account_id) ? template.account_id : null;
        const accountId = mapped(key) ?? templateAccount;
        const dates = parsed.transactions.map((t) => t.date).sort();
        parser = preset ? `csv:${preset}` : "csv";
        statements.push(
          await buildStatement(supabase, ws, form, accounts, hints, keywordCats, fileHash, {
            key,
            kind: "csv",
            source: accountId && accounts.get(accountId)?.type === "credit_card" ? "credit_card" : "bank",
            bankId: null,
            externalAccountId: null,
            label: `CSV${preset ? ` · ${preset}` : template ? ` · modelo “${template.name}”` : ""} · ${loaded.table.headers.length} colunas`,
            startDate: dates[0] ?? null,
            endDate: dates[dates.length - 1] ?? null,
            balance: null,
            accountId,
            declaredTotalCents: null,
            pdfDueDate: null,
            csv,
            transactions: parsed.transactions,
          }),
        );
      } else {
        const key = `${fi}:0`;
        const inv = loaded.invoice;
        const dates = inv.transactions.map((t) => t.date).sort();
        if (inv.skippedLines) warnings.push(`${inv.skippedLines} linha(s) do PDF ignorada(s).`);
        warnings.push("Leitura de PDF é aproximada: confira os lançamentos antes de importar.");
        parser = "pdf";
        statements.push(
          await buildStatement(supabase, ws, form, accounts, hints, keywordCats, fileHash, {
            key,
            kind: "pdf",
            source: "credit_card",
            bankId: null,
            externalAccountId: null,
            label: `Fatura em PDF${inv.dueDate ? ` · vence ${inv.dueDate.split("-").reverse().join("/")}` : ""}`,
            startDate: dates[0] ?? null,
            endDate: dates[dates.length - 1] ?? null,
            balance: null,
            accountId: mapped(key),
            declaredTotalCents: inv.totalCents,
            pdfDueDate: inv.dueDate,
            csv: null,
            transactions: inv.transactions,
          }),
        );
      }
      out.push({ fileName, fileHash, parser, warnings, statements });
    } catch (e) {
      const err =
        e instanceof ImportError
          ? { message: e.message, hint: e.hint }
          : { message: "Não foi possível ler o arquivo.", hint: "Confira se é um OFX, CSV ou PDF de fatura válido." };
      out.push({ fileName, fileHash, parser: "-", warnings: [], statements: [], error: err });
    }
  }
  return { ok: true, files: out };
}

/** Descrição normalizada → última categoria usada (sugestão até termos regras na Fase 6). */
async function loadCategoryHints(supabase: Supabase, ws: string) {
  const { data } = await supabase
    .from("transactions")
    .select("description, statement_description, installment_key, category_id")
    .eq("workspace_id", ws)
    .not("category_id", "is", null)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(2000);
  const map = new Map<string, string>();
  for (const t of data ?? []) {
    for (const d of [t.installment_key, t.statement_description, t.description]) {
      const k = d ? normalizeDescription(d) : "";
      if (k && !map.has(k)) map.set(k, t.category_id as string);
    }
  }
  return map;
}

type StatementInput = Omit<
  PreviewStatement,
  "rows" | "sameFileImportedAt" | "isCardAccount" | "invoiceDueDate"
> & { pdfDueDate: string | null; transactions: IncomingTx[] };

async function buildStatement(
  supabase: Supabase,
  ws: string,
  form: FormData,
  accounts: Map<string, Account>,
  hints: Map<string, string>,
  keywordCats: [RegExp, string][],
  fileHash: string,
  input: StatementInput,
): Promise<PreviewStatement> {
  const { pdfDueDate, transactions, ...rest } = input;
  const account = rest.accountId ? accounts.get(rest.accountId) : undefined;
  const isCard = account?.type === "credit_card";

  // Vencimento da fatura: escolhido pelo usuário > PDF > calculado pelo fechamento do cartão
  let invoiceDueDate: string | null = null;
  if (isCard) {
    const chosen = form.get(`due:${rest.key}`);
    if (typeof chosen === "string" && /^\d{4}-\d{2}-\d{2}$/.test(chosen)) invoiceDueDate = chosen;
    else if (pdfDueDate) invoiceDueDate = pdfDueDate;
    else if (account?.closing_day && account.due_day && rest.endDate) {
      invoiceDueDate = invoiceDatesForPurchase(account.closing_day, account.due_day, addDays(rest.endDate, -1)).dueDate;
    }
  }

  const base: PreviewStatement = { ...rest, source: isCard ? "credit_card" : rest.source, isCardAccount: isCard, invoiceDueDate, sameFileImportedAt: null, rows: null };
  if (!rest.accountId) return base;
  const accountId = rest.accountId;

  const { data: prev } = await supabase
    .from("import_batches")
    .select("created_at")
    .eq("account_id", accountId)
    .eq("file_hash", fileHash)
    .is("undone_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const incoming = withFingerprints(accountId, transactions).map((t, index) => ({ ...t, index }));
  const existing = await loadExisting(supabase, ws, accountId, incoming);
  const statuses = classifyRows(incoming, existing);

  const rows: PreviewRow[] = incoming.map((t) => {
    const status = statuses.get(t.index) ?? { kind: "new" as const };
    let note: string | null = null;
    let include = status.kind === "new" || status.kind === "reconcile";
    const norm = normalizeDescription(t.description);
    const raw = t.description.toUpperCase();
    if (isCard && t.amountCents > 0 && CARD_PAYMENT_RE.test(raw) && !/ESTORNO|CREDITO DE/.test(raw)) {
      include = false;
      note = "Pagamento da fatura: use “Pagar fatura” no cartão (vira transferência da conta, não receita).";
    } else if (!isCard && t.amountCents < 0 && BANK_INVOICE_PAYMENT_RE.test(raw)) {
      include = false;
      note = "Parece pagamento de fatura de cartão: registre com “Pagar fatura” para não contar a despesa duas vezes.";
    }
    const inst = detectInstallment(t.description, t.installment ?? null);
    const installment = inst && t.amountCents < 0 ? { number: inst.number, total: inst.total, key: inst.base } : null;
    const suggested =
      hints.get(installment?.key ?? norm) ?? hints.get(norm) ?? keywordCats.find(([re]) => re.test(raw))?.[1] ?? null;
    return {
      index: t.index,
      date: t.date,
      amountCents: t.amountCents,
      description: t.description,
      externalId: t.externalId,
      fingerprint: t.fingerprint,
      status,
      suggestedCategoryId: suggested,
      include: status.kind === "imported" ? false : include,
      note,
      installment,
      cardholder: t.cardholder ?? null,
    };
  });
  return { ...base, rows, sameFileImportedAt: prev?.created_at ?? null };
}

async function loadExisting(
  supabase: Supabase,
  ws: string,
  accountId: string,
  incoming: { date: string; externalId: string | null; fingerprint: string }[],
): Promise<ExistingTx[]> {
  if (!incoming.length) return [];
  const dates = incoming.map((t) => t.date).sort();
  const from = addDays(dates[0], -10);
  const to = addDays(dates[dates.length - 1], 10);
  const cols = "id, direction, amount_cents, description, status, due_date, paid_date, competence_date, external_id, fingerprint, origin";
  const { data } = await supabase
    .from("transactions")
    .select(cols)
    .eq("workspace_id", ws)
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .neq("origin", "installment")
    .or(`and(due_date.gte.${from},due_date.lte.${to}),and(paid_date.gte.${from},paid_date.lte.${to})`)
    .limit(5000);
  // FITID/fingerprint fora da janela de datas, em lotes
  const byIds: NonNullable<typeof data> = [];
  const quote = (s: string) => `"${s.replace(/["\\]/g, "")}"`;
  for (let i = 0; i < incoming.length; i += 150) {
    const chunk = incoming.slice(i, i + 150);
    const fitids = chunk.map((t) => t.externalId).filter(Boolean) as string[];
    const filters = [`fingerprint.in.(${chunk.map((t) => t.fingerprint).join(",")})`];
    if (fitids.length) filters.push(`external_id.in.(${fitids.map(quote).join(",")})`);
    const { data: found } = await supabase
      .from("transactions")
      .select(cols)
      .eq("account_id", accountId)
      .is("deleted_at", null)
      .or(filters.join(","));
    byIds.push(...(found ?? []));
  }
  const all = new Map([...(data ?? []), ...byIds].map((t) => [t.id, t]));
  return [...all.values()].map((t) => ({
    id: t.id,
    // Em cartão o due_date é o vencimento da fatura: comparamos pela data da compra
    date: t.status === "paid" && t.paid_date ? t.paid_date : (t.competence_date ?? t.due_date),
    amountCents: t.direction * t.amount_cents,
    description: t.description,
    status: t.status,
    externalId: t.external_id,
    fingerprint: t.fingerprint,
    origin: t.origin,
  }));
}

const commitSchema = z.object({
  workspaceId: uuid,
  accountId: uuid,
  fileName: z.string().min(1).max(200),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  parser: z.string().max(60),
  totalRows: z.number().int().min(0).max(100_000),
  bankId: z.string().max(40).nullable(),
  externalAccountId: z.string().max(80).nullable(),
  balance: z.object({ amountCents: z.number().int(), date: isoDate }).nullable(),
  invoiceDueDate: isoDate.nullable(),
  declaredTotalCents: z.number().int().nullable(),
  template: z
    .object({ name: z.string().trim().min(1).max(80), signature: z.string().max(32), mapping: csvMappingSchema })
    .nullable(),
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
        cardholder: z.string().max(80).nullable(),
        installment: z.object({ number: z.number().int().min(1), total: z.number().int().min(2).max(99), key: z.string().max(200) }).nullable(),
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

  if (v.template) {
    await supabase.from("import_templates").upsert(
      {
        workspace_id: v.workspaceId,
        account_id: v.accountId,
        name: v.template.name,
        header_signature: v.template.signature,
        config: v.template.mapping,
      },
      { onConflict: "workspace_id,header_signature" },
    );
  }

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
    p_invoice_due_date: v.invoiceDueDate,
    p_declared_total_cents: v.declaredTotalCents,
    p_rows: v.rows.map((r) => ({
      date: r.date,
      amount_cents: r.amountCents,
      description: r.description,
      external_id: r.externalId,
      fingerprint: r.fingerprint,
      category_id: r.categoryId,
      reconcile_tx_id: r.reconcileTxId,
      cardholder: r.cardholder,
      installment_number: r.installment?.number ?? null,
      installment_total: r.installment?.total ?? null,
      installment_key: r.installment?.key ?? null,
    })),
  });
  if (error || !data) {
    if (error?.code === "P0001") return { ok: false, message: error.message };
    if (error?.code === "PGRST202") {
      return { ok: false, message: "O banco ainda não tem a migration da Fase 4. Aplique-a no Supabase e tente de novo." };
    }
    console.error("commit_import falhou:", error?.code, error?.message);
    return { ok: false, message: "Não foi possível gravar a importação." };
  }
  const d = data as { batch_id: string; new: number; duplicates: number; reconciled: number; projected: number; invoice_id: string | null };

  let balanceCheck: { statement: number; system: number; date: string } | null = null;
  if (v.balance && !v.invoiceDueDate) {
    const { data: sys } = await supabase.rpc("account_balance_at", { p_account_id: v.accountId, p_date: v.balance.date });
    if (typeof sys === "number") balanceCheck = { statement: v.balance.amountCents, system: sys, date: v.balance.date };
  }
  let invoiceCheck: { declared: number; computed: number } | null = null;
  if (d.invoice_id && v.declaredTotalCents !== null) {
    const { data: inv } = await supabase.from("invoice_summaries").select("total_cents").eq("id", d.invoice_id).maybeSingle();
    if (inv) invoiceCheck = { declared: v.declaredTotalCents, computed: Number(inv.total_cents) };
  }
  revalidatePath(`/w/${v.workspaceId}`, "layout");
  return {
    ok: true,
    batchId: d.batch_id,
    created: d.new,
    duplicates: d.duplicates,
    reconciled: d.reconciled,
    projected: d.projected ?? 0,
    invoiceId: d.invoice_id,
    balanceCheck,
    invoiceCheck,
  };
}

export async function undoImport(form: FormData) {
  const v = z.object({ workspaceId: uuid, batchId: uuid }).parse(Object.fromEntries(form));
  const { supabase } = await getActionClient();
  await supabase.rpc("undo_import", { p_batch_id: v.batchId });
  revalidatePath(`/w/${v.workspaceId}`, "layout");
}
