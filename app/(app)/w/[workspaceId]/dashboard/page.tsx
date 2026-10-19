import Link from "next/link";
import { loadWorkspaceContext } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { addDays, formatDateBR, monthRange, todayISO } from "@/lib/finance/dates";

type Tx = {
  id: string;
  type: "income" | "expense";
  direction: 1 | -1;
  amount_cents: number;
  description: string;
  due_date: string;
  category: { name: string; parent: { name: string } | null } | null;
};

export default async function DashboardPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const today = todayISO();
  const { start, end } = monthRange(today.slice(0, 7));
  const in30 = addDays(today, 30);

  const [balances, monthTx, pending, invoices] = await Promise.all([
    supabase
      .from("account_balances")
      .select("account_id, name, type, balance_cents")
      .eq("workspace_id", workspaceId)
      .eq("archived", false)
      .order("name"),
    // Transferências não são receita nem despesa
    supabase
      .from("transactions")
      .select("id, type, direction, amount_cents, description, due_date, category:categories!category_id(name, parent:categories!parent_id(name))")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .in("type", ["income", "expense"])
      .neq("status", "cancelled")
      .gte("competence_date", start)
      .lte("competence_date", end),
    supabase
      .from("transactions")
      .select("id, type, direction, amount_cents, description, due_date")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .in("type", ["income", "expense"])
      .eq("status", "planned")
      // Parcelas de cartão são cobradas pela fatura (abaixo), não uma a uma
      .is("invoice_id", null)
      .lte("due_date", in30)
      .order("due_date")
      .limit(200),
    supabase
      .from("invoice_summaries")
      .select("id, account_id, due_date, total_cents")
      .eq("workspace_id", workspaceId)
      .is("paid_at", null)
      .lte("due_date", in30)
      .gt("total_cents", 0),
  ]);

  const accounts = (balances.data ?? []).filter((a) => a.type !== "credit_card");
  const cards = (balances.data ?? []).filter((a) => a.type === "credit_card");
  const totalBalance = accounts.reduce((s, a) => s + a.balance_cents, 0);
  const txs = (monthTx.data ?? []) as unknown as Tx[];
  const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount_cents, 0);
  // Estornos (despesa com sinal positivo) reduzem o gasto
  const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s - t.direction * t.amount_cents, 0);

  const cardNames = new Map((balances.data ?? []).map((a) => [a.account_id, a.name]));
  const invoiceDues = (invoices.data ?? []).map((i) => ({
    id: `inv-${i.id}`,
    type: "expense" as const,
    direction: -1 as const,
    amount_cents: Number(i.total_cents),
    description: `Fatura ${cardNames.get(i.account_id) ?? "do cartão"}`,
    due_date: i.due_date,
  }));
  const pend = [...((pending.data ?? []) as Omit<Tx, "category">[]), ...invoiceDues].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const overdue = pend.filter((t) => t.due_date < today);
  const upcoming = pend.filter((t) => t.due_date >= today);
  const sum = (list: typeof pend, type: string, until?: string) =>
    list.filter((t) => t.type === type && (!until || t.due_date <= until)).reduce((s, t) => s + t.amount_cents, 0);

  const byCategory = new Map<string, number>();
  txs
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const name = t.category ? (t.category.parent?.name ?? t.category.name) : "Sem categoria";
      byCategory.set(name, (byCategory.get(name) ?? 0) - t.direction * t.amount_cents);
    });
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topMax = top[0]?.[1] ?? 1;

  const kpis = [
    { label: "Saldo em contas", value: totalBalance, tone: totalBalance < 0 ? "text-danger" : "" },
    { label: "Receitas do mês", value: income, tone: "text-primary" },
    { label: "Despesas do mês", value: expense, tone: "text-danger" },
    { label: "Resultado do mês", value: income - expense, tone: income - expense < 0 ? "text-danger" : "text-primary" },
  ];
  const base = `/w/${workspaceId}`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-muted">{current.name}</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Olá! Veja como está o seu dindin 👋</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, i) =>
          i === 0 ? (
            <div key={k.label} className="relative overflow-hidden rounded-[1.25rem] bg-primary p-5 text-primary-fg shadow-sm">
              <p className="text-sm font-semibold opacity-80">{k.label}</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">{formatBRL(k.value)}</p>
              <div aria-hidden="true" className="absolute -right-8 -bottom-10 h-28 w-28 rounded-full border-[14px] border-primary-fg/10" />
            </div>
          ) : (
            <div key={k.label} className="card">
              <p className="text-sm font-semibold text-muted">{k.label}</p>
              <p className={`mt-1 text-2xl font-extrabold tabular-nums ${k.tone}`}>{formatBRL(k.value)}</p>
            </div>
          ),
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-3">
          <h2 className="font-medium">A pagar e a receber</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">A pagar em 7 dias</dt>
            <dd className="text-right tabular-nums">{formatBRL(sum(upcoming, "expense", addDays(today, 7)))}</dd>
            <dt className="text-muted">A pagar em 30 dias</dt>
            <dd className="text-right tabular-nums">{formatBRL(sum(upcoming, "expense"))}</dd>
            <dt className="text-muted">A receber em 30 dias</dt>
            <dd className="text-right tabular-nums">{formatBRL(sum(upcoming, "income"))}</dd>
            <dt className="text-danger">Atrasados</dt>
            <dd className="text-right text-danger tabular-nums">
              {formatBRL(sum(overdue, "expense"))}
            </dd>
          </dl>
          {overdue.length > 0 && (
            <ul className="space-y-1 border-t border-border pt-3 text-sm">
              {overdue.slice(0, 5).map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    <span className="text-danger">{formatDateBR(t.due_date)}</span> {t.description}
                  </span>
                  <span className="tabular-nums">{formatBRL(t.amount_cents)}</span>
                </li>
              ))}
              <li>
                <Link href={`${base}/lancamentos?status=overdue`} className="text-xs text-muted hover:underline">
                  Ver todos os atrasados
                </Link>
              </li>
            </ul>
          )}
        </section>

        <section className="card space-y-3">
          <h2 className="font-medium">Saldo por conta</h2>
          <ul className="space-y-2 text-sm">
            {accounts.map((a) => (
              <li key={a.account_id} className="flex justify-between">
                <span>{a.name}</span>
                <span className={`tabular-nums ${a.balance_cents < 0 ? "text-danger" : ""}`}>{formatBRL(a.balance_cents)}</span>
              </li>
            ))}
            {cards.map((a) => (
              <li key={a.account_id} className="flex justify-between text-muted">
                <span>{a.name} (cartão)</span>
                <span className="tabular-nums">{formatBRL(a.balance_cents)}</span>
              </li>
            ))}
          </ul>
          <Link href={`${base}/contas`} className="text-xs text-muted hover:underline">
            Gerenciar contas
          </Link>
        </section>

        <section className="card space-y-3">
          <h2 className="font-medium">Maiores despesas do mês</h2>
          {top.length === 0 ? (
            <p className="text-sm text-muted">Sem despesas neste mês.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {top.map(([name, value]) => (
                <li key={name}>
                  <div className="flex justify-between">
                    <span>{name}</span>
                    <span className="tabular-nums">{formatBRL(value)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-background">
                    <div className="h-1.5 rounded-full bg-danger" style={{ width: `${(value / topMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
