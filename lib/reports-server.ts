import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportTx } from "@/lib/finance/reports";

const SELECT =
  "type, direction, amount_cents, status, competence_date, due_date, paid_date, account_id, category:categories!category_id(name, parent:parent_id(name)), contact:contacts!contact_id(name), cost_center:cost_centers!cost_center_id(name)";

/** Lançamentos de receita/despesa que tocam o período em qualquer data (competência, vencimento ou pagamento). */
export async function loadReportTx(
  supabase: SupabaseClient,
  workspaceId: string,
  from: string,
  to: string,
  accountId?: string | null,
): Promise<(ReportTx & { account_id: string })[]> {
  const out: (ReportTx & { account_id: string })[] = [];
  const range = (c: string) => `and(${c}.gte.${from},${c}.lte.${to})`;
  for (let page = 0; page < 50; page++) {
    let q = supabase
      .from("transactions")
      .select(SELECT)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .in("type", ["income", "expense"])
      .or([range("competence_date"), range("due_date"), range("paid_date")].join(","))
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (accountId) q = q.eq("account_id", accountId);
    const { data, error } = await q;
    if (error) throw new Error("Falha ao carregar o relatório");
    out.push(...((data ?? []) as unknown as (ReportTx & { account_id: string })[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Saldo de abertura (antes de from) e movimentos pagos no período, para as contas (exceto cartões). */
export async function loadBalanceMoves(supabase: SupabaseClient, workspaceId: string, from: string, to: string, accountId?: string | null) {
  let accQ = supabase.from("accounts").select("id, initial_balance_cents").eq("workspace_id", workspaceId).neq("type", "credit_card");
  if (accountId) accQ = accQ.eq("id", accountId);
  const { data: accounts } = await accQ;
  const ids = (accounts ?? []).map((a) => a.id);
  if (!ids.length) return { opening: 0, moves: [] as { date: string; amount: number }[] };
  let opening = (accounts ?? []).reduce((a, x) => a + Number(x.initial_balance_cents), 0);
  const moves: { date: string; amount: number }[] = [];
  for (let page = 0; page < 100; page++) {
    const { data } = await supabase
      .from("transactions")
      .select("paid_date, direction, amount_cents")
      .eq("workspace_id", workspaceId)
      .in("account_id", ids)
      .is("deleted_at", null)
      .eq("status", "paid")
      .lte("paid_date", to)
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    for (const t of data ?? []) {
      const v = t.direction * t.amount_cents;
      if (t.paid_date! < from) opening += v;
      else moves.push({ date: t.paid_date!, amount: v });
    }
    if (!data || data.length < 1000) break;
  }
  return { opening, moves };
}
