import Link from "next/link";
import { loadWorkspaceContext } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { formatDateBR, todayISO } from "@/lib/finance/dates";
import { CountUp } from "@/components/count-up";

export default async function CardsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase } = await loadWorkspaceContext(workspaceId);
  const today = todayISO();

  const [{ data: cards }, { data: invoices }, { data: balances }] = await Promise.all([
    supabase
      .from("credit_cards")
      .select("account_id, limit_cents, closing_day, due_day, account:accounts!credit_cards_account_id_fkey(name, archived)")
      .eq("workspace_id", workspaceId),
    supabase
      .from("invoice_summaries")
      .select("id, account_id, due_date, closing_date, total_cents, status")
      .eq("workspace_id", workspaceId)
      .gte("due_date", today)
      .order("due_date"),
    supabase.from("account_balances").select("account_id, projected_balance_cents").eq("workspace_id", workspaceId),
  ]);

  const list = (cards ?? [])
    .map((c) => ({ ...c, account: c.account as unknown as { name: string; archived: boolean } }))
    .filter((c) => !c.account?.archived);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Cartões de crédito</h1>
      {list.length === 0 && (
        <div className="card text-sm text-muted">
          Nenhum cartão cadastrado.{" "}
          <Link className="text-primary underline" href={`/w/${workspaceId}/contas`}>
            Cadastre um cartão em Contas e cartões
          </Link>{" "}
          com dia de fechamento e vencimento.
        </div>
      )}
      <div className="stagger grid gap-4 md:grid-cols-2">
        {list.map((c) => {
          const next = (invoices ?? []).find((i) => i.account_id === c.account_id && i.status !== "paid");
          const used = -Number((balances ?? []).find((b) => b.account_id === c.account_id)?.projected_balance_cents ?? 0);
          const pct = c.limit_cents ? Math.min(100, Math.max(0, (used / c.limit_cents) * 100)) : 0;
          return (
            <Link key={c.account_id} href={`/w/${workspaceId}/cartoes/${c.account_id}`} className="card lift block space-y-4 hover:border-primary/40">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold">{c.account.name}</p>
                  <p className="text-xs text-muted">
                    Fecha dia {c.closing_day} · vence dia {c.due_day}
                  </p>
                </div>
                {next && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${next.status === "open" ? "bg-primary-soft text-primary" : "bg-accent-soft"}`}>
                    {next.status === "open" ? "Aberta" : "Fechada"}
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm text-muted">{next ? `Fatura que vence em ${formatDateBR(next.due_date)}` : "Sem fatura em aberto"}</p>
                <CountUp cents={next ? Number(next.total_cents) : 0} className="block text-2xl font-extrabold tabular-nums" />
              </div>
              {c.limit_cents > 0 && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-surface-2">
                    <div className={`bar-grow h-2 rounded-full ${pct > 85 ? "bg-danger" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-muted">
                    Limite usado {formatBRL(used)} de {formatBRL(c.limit_cents)} · disponível {formatBRL(c.limit_cents - used)}
                  </p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
