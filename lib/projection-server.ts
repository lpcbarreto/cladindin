import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/finance/dates";
import { projectBalance, type ProjectionEvent } from "@/lib/finance/projection";

/**
 * Projeção do saldo das contas (sem cartões): saldo atual + previstos + faturas em aberto.
 * Compras no cartão entram pela fatura, no vencimento.
 */
export async function loadProjection(supabase: SupabaseClient, workspaceId: string, today: string, days: number) {
  const until = addDays(today, days);
  const [balances, planned, invoices] = await Promise.all([
    supabase.from("account_balances").select("account_id, name, type, balance_cents").eq("workspace_id", workspaceId).eq("archived", false),
    supabase
      .from("transactions")
      .select("account_id, direction, amount_cents, description, due_date")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .eq("status", "planned")
      .in("type", ["income", "expense"])
      .is("invoice_id", null)
      .lte("due_date", until)
      .limit(5000),
    supabase
      .from("invoice_summaries")
      .select("account_id, due_date, total_cents")
      .eq("workspace_id", workspaceId)
      .is("paid_at", null)
      .lte("due_date", until)
      .gt("total_cents", 0),
  ]);
  const accounts = (balances.data ?? []).filter((a) => a.type !== "credit_card");
  const bank = new Set(accounts.map((a) => a.account_id));
  const names = new Map((balances.data ?? []).map((a) => [a.account_id, a.name]));
  const start = accounts.reduce((s, a) => s + Number(a.balance_cents), 0);
  const events: ProjectionEvent[] = [
    ...(planned.data ?? [])
      .filter((t) => bank.has(t.account_id))
      .map((t) => ({ date: t.due_date, cents: t.direction * t.amount_cents, description: t.description })),
    ...(invoices.data ?? []).map((i) => ({
      date: i.due_date,
      cents: -Number(i.total_cents),
      description: `Fatura ${names.get(i.account_id) ?? "do cartão"}`,
    })),
  ];
  return { start, events, ...projectBalance(start, today, days, events) };
}
