import type { SupabaseClient } from "@supabase/supabase-js";
import { monthRange, todayISO } from "@/lib/finance/dates";

export type Option = { id: string; name: string };
export type CategoryOption = Option & { kind: "income" | "expense" };

/** Contas, categorias (com pai no nome) e contatos para selects. */
export async function loadOptions(supabase: SupabaseClient, workspaceId: string) {
  const [accounts, categories, contacts] = await Promise.all([
    supabase.from("accounts").select("id, name").eq("workspace_id", workspaceId).eq("archived", false).order("name"),
    supabase
      .from("categories")
      .select("id, name, kind, parent_id")
      .eq("workspace_id", workspaceId)
      .eq("archived", false)
      .order("name"),
    supabase.from("contacts").select("id, name").eq("workspace_id", workspaceId).order("name").limit(500),
  ]);
  const cats = categories.data ?? [];
  const byId = new Map(cats.map((c) => [c.id, c]));
  const categoryOptions: CategoryOption[] = cats
    .map((c) => ({
      id: c.id,
      kind: c.kind as CategoryOption["kind"],
      name: c.parent_id ? `${byId.get(c.parent_id)?.name ?? ""} › ${c.name}` : c.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return {
    accounts: (accounts.data ?? []) as Option[],
    categories: categoryOptions,
    contacts: (contacts.data ?? []) as Option[],
  };
}

export type TxFilters = {
  mes?: string;
  conta?: string;
  categoria?: string;
  status?: string;
  tipo?: string;
  q?: string;
  pagina?: string;
};

export const PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f-]{36}$/i;

export const TX_SELECT =
  "id, type, direction, amount_cents, description, competence_date, due_date, paid_date, status, transfer_group_id, origin, reconciled, account:accounts(id, name), category:categories(id, name), contact:contacts(id, name), attachments(count)";

export type TxRow = {
  id: string;
  type: "income" | "expense" | "transfer";
  direction: 1 | -1;
  amount_cents: number;
  description: string;
  competence_date: string;
  due_date: string;
  paid_date: string | null;
  status: "planned" | "paid" | "cancelled";
  transfer_group_id: string | null;
  origin: string;
  reconciled: boolean;
  account: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  contact: { id: string; name: string } | null;
  attachments?: { count: number }[];
};

/** Monta a consulta de lançamentos aplicando os filtros da URL (sempre validados). */
export function buildTxQuery(supabase: SupabaseClient, workspaceId: string, f: TxFilters, opts: { paginate: boolean }) {
  const month = f.mes && /^\d{4}-\d{2}$/.test(f.mes) ? f.mes : todayISO().slice(0, 7);
  const { start, end } = monthRange(month);
  let q = supabase
    .from("transactions")
    .select(TX_SELECT, { count: opts.paginate ? "exact" : undefined })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .gte("due_date", start)
    .lte("due_date", end)
    .order("due_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (f.conta && UUID_RE.test(f.conta)) q = q.eq("account_id", f.conta);
  if (f.categoria === "sem") q = q.is("category_id", null).neq("type", "transfer");
  else if (f.categoria && UUID_RE.test(f.categoria)) q = q.eq("category_id", f.categoria);
  if (f.tipo === "income" || f.tipo === "expense" || f.tipo === "transfer") q = q.eq("type", f.tipo);
  if (f.status === "paid" || f.status === "planned" || f.status === "cancelled") q = q.eq("status", f.status);
  if (f.status === "overdue") q = q.eq("status", "planned").lt("due_date", todayISO());
  if (f.q?.trim()) q = q.ilike("description", `%${f.q.trim().replace(/[%_,()]/g, "")}%`);

  if (opts.paginate) {
    const page = Math.max(1, Number(f.pagina) || 1);
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  }
  return { query: q, month };
}
