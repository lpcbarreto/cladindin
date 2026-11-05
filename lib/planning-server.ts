import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthRange } from "@/lib/finance/dates";
import { addMonths, monthOf, type PlanItem } from "@/lib/finance/planning";

/**
 * Tudo o que está previsto nas contas (sem cartões) nos próximos meses: lançamentos em aberto
 * (fixos, parcelas, avulsos) e faturas de cartão no vencimento. Mais as contas marcadas para reserva.
 */
export async function loadPlan(supabase: SupabaseClient, workspaceId: string, today: string, months: number) {
  const until = monthRange(addMonths(monthOf(today), months - 1)).end;
  const [balances, planned, invoices, reserves] = await Promise.all([
    supabase.from("account_balances").select("account_id, name, type, balance_cents").eq("workspace_id", workspaceId).eq("archived", false),
    supabase
      .from("transactions")
      .select("id, account_id, direction, amount_cents, description, due_date, recurrence_id, installment_number, installment_total")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .eq("status", "planned")
      .in("type", ["income", "expense"])
      .is("invoice_id", null)
      .lte("due_date", until)
      .order("due_date")
      .limit(5000),
    supabase
      .from("invoice_summaries")
      .select("id, account_id, due_date, total_cents")
      .eq("workspace_id", workspaceId)
      .is("paid_at", null)
      .lte("due_date", until)
      .gt("total_cents", 0),
    supabase
      .from("transactions")
      .select("id, description, due_date, amount_cents")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .eq("status", "planned")
      .eq("type", "expense")
      .eq("plan_reserve", true)
      .order("due_date")
      .limit(200),
  ]);
  const accounts = (balances.data ?? []).filter((a) => a.type !== "credit_card");
  const bank = new Set(accounts.map((a) => a.account_id));
  const names = new Map((balances.data ?? []).map((a) => [a.account_id, a.name]));
  const start = accounts.reduce((s, a) => s + Number(a.balance_cents), 0);
  const items: PlanItem[] = [
    ...(planned.data ?? [])
      .filter((t) => bank.has(t.account_id))
      .map((t) => ({
        id: t.id,
        date: t.due_date,
        cents: t.direction * t.amount_cents,
        description: t.description,
        kind: "lancamento" as const,
        recurring: !!t.recurrence_id,
        installment: t.installment_number ? `${t.installment_number}/${t.installment_total}` : null,
      })),
    ...(invoices.data ?? []).map((i) => ({
      id: `fatura-${i.id}`,
      date: i.due_date,
      cents: -Number(i.total_cents),
      description: `Fatura ${names.get(i.account_id) ?? "do cartão"}`,
      kind: "fatura" as const,
    })),
  ];
  return {
    start,
    items,
    accounts: accounts.map((a) => ({ id: a.account_id, name: a.name })),
    reserves: (reserves.data ?? []).map((r) => ({ id: r.id, description: r.description, dueDate: r.due_date, cents: r.amount_cents })),
  };
}
