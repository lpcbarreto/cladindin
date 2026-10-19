import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthRange } from "@/lib/finance/dates";
import { buildBudget } from "@/lib/finance/budget";

/** Orçamento x realizado (competência) do mês, por categoria principal de despesa. */
export async function loadBudget(supabase: SupabaseClient, workspaceId: string, month: string) {
  const { start, end } = monthRange(month);
  const [{ data: cats }, { data: budgets }, { data: txs }] = await Promise.all([
    supabase.from("categories").select("id, name, parent_id, kind").eq("workspace_id", workspaceId).eq("archived", false),
    supabase.from("budgets").select("category_id, month, amount_cents").eq("workspace_id", workspaceId).or(`month.is.null,month.eq.${start}`),
    supabase
      .from("transactions")
      .select("category_id, status, direction, amount_cents")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .eq("type", "expense")
      .gte("competence_date", start)
      .lte("competence_date", end)
      .limit(10000),
  ]);
  return buildBudget(
    cats ?? [],
    (budgets ?? []).map((b) => ({ ...b, amount_cents: Number(b.amount_cents) })),
    (txs ?? []).map((t) => ({ category_id: t.category_id, status: t.status, signed: t.direction * t.amount_cents })),
    month,
  );
}
