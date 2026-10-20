"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { dbErrorMessage, getActionClient, uuid } from "@/lib/actions";
import { parseQuickAdd } from "@/lib/finance/quick-add";
import { findRule } from "@/lib/finance/rules";
import { todayISO } from "@/lib/finance/dates";
import { formatBRL } from "@/lib/finance/money";
import { loadRules } from "@/lib/rules-server";
import { userRateLimit } from "@/lib/rate-limit";

const UNDO_COOKIE = "desfazer";

const quickSchema = z.object({ workspaceId: uuid, text: z.string().trim().min(1).max(300) });

/** Lançamento rápido: "mercado 120 nubank". Aplica as regras de categorização. */
export async function quickAdd(workspaceId: string, text: string): Promise<{ ok: boolean; message: string; id?: string }> {
  const parsed = quickSchema.safeParse({ workspaceId, text });
  if (!parsed.success) return { ok: false, message: "Digite algo como “mercado 120 nubank”." };
  const { supabase, user } = await getActionClient();
  if (!(await userRateLimit(supabase, user.id, "quick-add", 60, 60_000))) return { ok: false, message: "Muitas tentativas seguidas. Aguarde um pouco e tente de novo." };
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, type")
    .eq("workspace_id", workspaceId)
    .eq("archived", false)
    .order("name");
  if (!accounts?.length) return { ok: false, message: "Cadastre uma conta antes de lançar." };

  const today = todayISO();
  const q = parseQuickAdd(parsed.data.text, accounts, today);
  if (q.amountCents === null) return { ok: false, message: "Faltou o valor. Ex.: “mercado 120”." };
  if (!q.description) return { ok: false, message: "Faltou a descrição. Ex.: “mercado 120”." };
  const account = accounts.find((a) => a.id === q.accountId) ?? accounts.find((a) => a.type !== "credit_card") ?? accounts[0];

  const rule = findRule(await loadRules(supabase, workspaceId), {
    description: q.description,
    amountCents: q.type === "income" ? q.amountCents : -q.amountCents,
    accountId: account.id,
  });
  const paid = q.date <= today;
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      workspace_id: workspaceId,
      account_id: account.id,
      type: q.type,
      direction: q.type === "income" ? 1 : -1,
      amount_cents: q.amountCents,
      description: q.description,
      due_date: q.date,
      competence_date: q.date,
      status: paid ? "paid" : "planned",
      paid_date: paid ? q.date : null,
      category_id: rule?.categoryId ?? null,
      contact_id: rule?.contactId ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/w/${workspaceId}`, "layout");
  const kind = q.type === "income" ? "Receita" : "Despesa";
  return { ok: true, id: data.id, message: `${kind} de ${formatBRL(q.amountCents)} em ${account.name}${rule ? " (categorizada pela regra)" : ""}.` };
}

export type SearchHit = { kind: "lancamento" | "contato" | "categoria"; id: string; title: string; subtitle: string; href: string };

/** Busca global (Ctrl+K): lançamentos, contatos e categorias. */
export async function searchAll(workspaceId: string, term: string): Promise<SearchHit[]> {
  if (!uuid.safeParse(workspaceId).success) return [];
  const t = term.trim().replace(/[%_,()]/g, "").slice(0, 60);
  if (t.length < 2) return [];
  const { supabase, user } = await getActionClient();
  if (!(await userRateLimit(supabase, user.id, "search", 120, 60_000))) return [];
  const base = `/w/${workspaceId}`;
  const [txs, contacts, cats] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, description, amount_cents, direction, due_date, type")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .neq("type", "transfer")
      .ilike("description", `%${t}%`)
      .order("due_date", { ascending: false })
      .limit(8),
    supabase.from("contacts").select("id, name").eq("workspace_id", workspaceId).ilike("name", `%${t}%`).limit(4),
    supabase.from("categories").select("id, name, kind").eq("workspace_id", workspaceId).eq("archived", false).ilike("name", `%${t}%`).limit(4),
  ]);
  return [
    ...(txs.data ?? []).map((r) => ({
      kind: "lancamento" as const,
      id: r.id,
      title: r.description,
      subtitle: `${r.due_date.split("-").reverse().join("/")} · ${formatBRL(r.direction * r.amount_cents)}`,
      href: `${base}/lancamentos/${r.id}`,
    })),
    ...(contacts.data ?? []).map((c) => ({
      kind: "contato" as const,
      id: c.id,
      title: c.name,
      subtitle: "Contato",
      href: `${base}/lancamentos?q=${encodeURIComponent(c.name)}`,
    })),
    ...(cats.data ?? []).map((c) => ({
      kind: "categoria" as const,
      id: c.id,
      title: c.name,
      subtitle: c.kind === "income" ? "Categoria de receita" : "Categoria de despesa",
      href: `${base}/lancamentos?categoria=${c.id}`,
    })),
  ];
}

const undoSchema = z.object({ ws: uuid, ids: z.array(uuid).min(1).max(1000) });

/** Guarda por 30 s o que acabou de ser excluído, para o aviso "Desfazer". */
export async function rememberDeleted(workspaceId: string, ids: string[]) {
  (await cookies()).set(UNDO_COOKIE, JSON.stringify({ ws: workspaceId, ids }), {
    maxAge: 30,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function readUndo() {
  const raw = (await cookies()).get(UNDO_COOKIE)?.value;
  if (!raw) return null;
  try {
    const p = undoSchema.safeParse(JSON.parse(raw));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

export async function undoDelete() {
  const undo = await readUndo();
  (await cookies()).delete(UNDO_COOKIE);
  if (!undo) return;
  const { supabase } = await getActionClient();
  await supabase.from("transactions").update({ deleted_at: null }).eq("workspace_id", undo.ws).in("id", undo.ids);
  revalidatePath(`/w/${undo.ws}`, "layout");
}

export async function dismissUndo() {
  (await cookies()).delete(UNDO_COOKIE);
}
