import Link from "next/link";
import { loadWorkspaceContext } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { addDays, formatDateBR, formatMonthBR, monthRange, shiftMonth, todayISO } from "@/lib/finance/dates";
import { DashboardPrefs, OnboardingDismiss } from "@/components/dashboard-prefs";
import { loadBudget } from "@/lib/budget-server";
import { budgetStatus } from "@/lib/finance/budget";
import { CountUp } from "@/components/count-up";
import { loadProjection } from "@/lib/projection-server";

type Tx = {
  id: string;
  type: "income" | "expense";
  direction: 1 | -1;
  amount_cents: number;
  description: string;
  due_date: string;
  category: { name: string; parent: { name: string } | null } | null;
};

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { workspaceId } = await params;
  const { mes } = await searchParams;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const today = todayISO();
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : today.slice(0, 7);
  const { start, end } = monthRange(month);
  const in30 = addDays(today, 30);

  // Tudo em paralelo: uma única ida ao banco por consulta, sem esperar uma pela outra
  const [projection, budgetRows, balances, monthTx, pending, invoices, txCount, importCount, recCount] = await Promise.all([
    loadProjection(supabase, workspaceId, today, 30).catch(() => null),
    loadBudget(supabase, workspaceId, month).catch(() => []),
    supabase
      .from("account_balances")
      .select("account_id, name, type, balance_cents")
      .eq("workspace_id", workspaceId)
      .eq("archived", false)
      .order("name"),
    // Transferências não são receita nem despesa
    supabase
      .from("transactions")
      .select("id, type, direction, amount_cents, description, due_date, category:categories!category_id(name, parent:parent_id(name))")
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
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("deleted_at", null),
    supabase.from("import_batches").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase.from("recurrence_rules").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
  ]);
  const budgetAlerts = budgetRows.filter((b) => ["over", "attention"].includes(budgetStatus(b))).slice(0, 6);

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
    { label: "Receitas", value: income, tone: "text-primary" },
    { label: "Despesas", value: expense, tone: "text-danger" },
    { label: "Resultado", value: income - expense, tone: income - expense < 0 ? "text-danger" : "text-primary" },
  ];
  const base = `/w/${workspaceId}`;
  const steps = [
    { done: (balances.data ?? []).length > 0, label: "Cadastre suas contas e cartões", href: `${base}/contas` },
    { done: (importCount.count ?? 0) > 0, label: "Importe um extrato (OFX, CSV ou PDF)", href: `${base}/importar` },
    { done: (txCount.count ?? 0) > 0, label: "Faça seu primeiro lançamento (aperte N)", href: `${base}/lancamentos` },
    { done: (recCount.count ?? 0) > 0, label: "Cadastre contas fixas (aluguel, luz, salário)", href: `${base}/recorrencias` },
    { done: budgetRows.some((b) => b.budget), label: "Defina um orçamento por categoria", href: `${base}/orcamento` },
  ];
  const stepsDone = steps.filter((st) => st.done).length;
  const sections = [
    { id: "kpis", label: "Saldo e resultado do mês" },
    { id: "pagar", label: "A pagar e a receber" },
    { id: "contas", label: "Saldo por conta" },
    { id: "despesas", label: "Maiores despesas" },
    { id: "orcamento", label: "Alertas de orçamento" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">{current.name}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Olá! Veja como está o seu dindin 👋</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-surface-2 p-1 text-sm font-semibold">
            <Link href={`${base}/dashboard?mes=${shiftMonth(month, -1)}`} className="rounded-full px-3 py-1 text-muted hover:text-foreground" aria-label="Mês anterior">
              ‹
            </Link>
            <span className="px-2 capitalize">{formatMonthBR(month)}</span>
            <Link href={`${base}/dashboard?mes=${shiftMonth(month, 1)}`} className="rounded-full px-3 py-1 text-muted hover:text-foreground" aria-label="Próximo mês">
              ›
            </Link>
          </div>
          <DashboardPrefs sections={sections} />
        </div>
      </div>

      {stepsDone < steps.length && (
        <OnboardingDismiss>
          <section className="card space-y-3 bg-primary-soft">
            <div>
              <h2 className="font-bold">
                Primeiros passos · {stepsDone} de {steps.length}
              </h2>
              <p className="text-sm text-muted">Complete para o Cladindin trabalhar por você.</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface">
              <div className="bar-grow h-2 rounded-full bg-primary" style={{ width: `${(stepsDone / steps.length) * 100}%` }} />
            </div>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {steps.map((st) => (
                <li key={st.label}>
                  <Link
                    href={st.href}
                    className={`flex items-center gap-2 rounded-xl bg-surface px-3 py-2 ${st.done ? "text-muted line-through" : "font-semibold hover:underline"}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ${st.done ? "bg-primary text-primary-fg" : "border border-border"}`}
                    >
                      {st.done ? "✓" : ""}
                    </span>
                    {st.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </OnboardingDismiss>
      )}

      {projection?.firstNegative && (
        <Link href={`${base}/projecao`} role="alert" className="card lift block border-danger/40 bg-danger-soft text-sm">
          <b className="text-danger">Cuidado:</b> pelas contas previstas, o saldo fica negativo em <b>{formatDateBR(projection.firstNegative)}</b>{" "}
          (mínimo de <b className="tabular-nums">{formatBRL(projection.lowest.balance)}</b>). Ver projeção →
        </Link>
      )}

      <div data-section="kpis" className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, i) =>
          i === 0 ? (
            <div key={k.label} className="relative overflow-hidden rounded-[1.25rem] bg-primary p-5 text-primary-fg shadow-sm">
              <p className="text-sm font-semibold opacity-80">{k.label}</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums"><CountUp cents={k.value} /></p>
              <div aria-hidden="true" className="absolute -right-8 -bottom-10 h-28 w-28 rounded-full border-[14px] border-primary-fg/10" />
            </div>
          ) : (
            <div key={k.label} className="card">
              <p className="text-sm font-semibold text-muted">{k.label}</p>
              <p className={`mt-1 text-2xl font-extrabold tabular-nums ${k.tone}`}><CountUp cents={k.value} /></p>
            </div>
          ),
        )}
      </div>

      <div className="stagger grid gap-4 lg:grid-cols-3">
        <section data-section="pagar" className="card space-y-3">
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

        <section data-section="contas" className="card space-y-3">
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

        <section data-section="despesas" className="card space-y-3">
          <h2 className="font-medium">Maiores despesas do mês</h2>
          {top.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted">
              <p className="text-2xl" aria-hidden="true">
                🌱
              </p>
              <p>Sem despesas neste mês.</p>
              <p className="text-xs">
                Aperte <kbd className="rounded bg-surface-2 px-1">N</kbd> para lançar a primeira.
              </p>
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {top.map(([name, value]) => (
                <li key={name}>
                  <div className="flex justify-between">
                    <span>{name}</span>
                    <span className="tabular-nums">{formatBRL(value)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                    <div className="bar-grow h-1.5 rounded-full" style={{ width: `${(value / topMax) * 100}%`, background: "var(--series-expense)" }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {budgetAlerts.length > 0 && (
        <section data-section="orcamento" className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Orçamento do mês</h2>
            <Link href={`${base}/orcamento`} className="text-xs text-muted hover:underline">
              Ver orçamento
            </Link>
          </div>
          <ul className="stagger grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {budgetAlerts.map((b) => {
              const used = b.spent + b.planned;
              const over = used > (b.budget ?? 0);
              return (
                <li key={b.categoryId} className={`rounded-2xl p-3 text-sm ${over ? "bg-danger-soft" : "bg-accent-soft"}`}>
                  <p className="font-semibold">
                    {over ? "⚠ Estourado" : "● Atenção"} · {b.name}
                  </p>
                  <p className="text-muted">
                    {formatBRL(used)} de {formatBRL(b.budget ?? 0)} ({Math.round((used / (b.budget ?? 1)) * 100)}%)
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
