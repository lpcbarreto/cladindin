import Link from "next/link";
import { Icon } from "@/components/icon";
import { loadWorkspaceContext } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { addDays, formatDateBR, formatMonthBR, monthRange, shiftMonth, todayISO } from "@/lib/finance/dates";
import { DashboardPrefs, OnboardingDismiss } from "@/components/dashboard-prefs";
import { loadBudget } from "@/lib/budget-server";
import { budgetStatus } from "@/lib/finance/budget";
import { reservePlan } from "@/lib/finance/planning";
import { CountUp } from "@/components/count-up";
import { FlowChart } from "@/components/charts";
import { loadProjection } from "@/lib/projection-server";

type Tx = {
  id: string;
  type: "income" | "expense";
  direction: 1 | -1;
  amount_cents: number;
  competence_date: string;
  category: { name: string; parent: { name: string } | null } | null;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Mini gráfico de linha (só desenho; os valores estão no cartão). */
function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 80},${22 - ((v - min) / span) * 20}`).join(" ");
  return (
    <svg viewBox="0 0 80 24" className="h-6 w-20 shrink-0 overflow-visible" aria-hidden="true">
      <polyline className="draw-line" pathLength={1} points={pts} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

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
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
  const sixStart = monthRange(months[0]).start;
  const { end } = monthRange(month);
  const in30 = addDays(today, 30);

  // Tudo em paralelo: uma ida ao banco por consulta
  const [projection, budgetRows, balances, sixTx, pending, invoices, reserves, txCount, importCount, recCount] = await Promise.all([
    loadProjection(supabase, workspaceId, today, 365).catch(() => null),
    loadBudget(supabase, workspaceId, month).catch(() => []),
    supabase.from("account_balances").select("account_id, name, type, balance_cents").eq("workspace_id", workspaceId).eq("archived", false).order("name"),
    // 6 meses por competência (transferências não são receita nem despesa)
    supabase
      .from("transactions")
      .select("id, type, direction, amount_cents, competence_date, category:categories!category_id(name, parent:parent_id(name))")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .in("type", ["income", "expense"])
      .neq("status", "cancelled")
      .gte("competence_date", sixStart)
      .lte("competence_date", end)
      .limit(20000),
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
    supabase.from("invoice_summaries").select("id, account_id, due_date, total_cents").eq("workspace_id", workspaceId).is("paid_at", null).lte("due_date", in30).gt("total_cents", 0),
    supabase.from("transactions").select("id, description, due_date, amount_cents").eq("workspace_id", workspaceId).is("deleted_at", null).eq("status", "planned").eq("type", "expense").eq("plan_reserve", true).limit(200),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("deleted_at", null),
    supabase.from("import_batches").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase.from("recurrence_rules").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
  ]);

  const accounts = (balances.data ?? []).filter((a) => a.type !== "credit_card");
  const cards = (balances.data ?? []).filter((a) => a.type === "credit_card");
  const totalBalance = accounts.reduce((s, a) => s + a.balance_cents, 0);

  // Receitas e despesas por mês (estorno = despesa com sinal positivo, reduz o gasto)
  const all = (sixTx.data ?? []) as unknown as Tx[];
  const flow = months.map((m) => {
    const list = all.filter((t) => t.competence_date.startsWith(m));
    return {
      month: m,
      income: list.filter((t) => t.type === "income").reduce((s, t) => s + t.amount_cents, 0),
      expense: list.filter((t) => t.type === "expense").reduce((s, t) => s - t.direction * t.amount_cents, 0),
    };
  });
  const cur = flow[5];
  const prev = flow[4];
  const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
  const incomeDelta = pct(cur.income, prev.income);
  const expenseDelta = pct(cur.expense, prev.expense);
  const net = cur.income - cur.expense;
  const prevLabel = formatMonthBR(prev.month).split(" ")[0].toLowerCase();

  const kpis = [
    { label: "Saldo em contas", value: totalBalance, tone: totalBalance < 0 ? "text-danger" : "", note: `${accounts.length} conta(s)`, noteTone: "text-muted", spark: null as number[] | null, color: "var(--series-balance)" },
    {
      label: "Receitas",
      value: cur.income,
      tone: "",
      note: incomeDelta === null ? "sem comparação" : `${incomeDelta >= 0 ? "+" : "−"}${Math.abs(incomeDelta)}% vs ${prevLabel}`,
      noteTone: incomeDelta === null ? "text-muted" : incomeDelta >= 0 ? "text-primary" : "text-danger",
      spark: flow.map((f) => f.income),
      color: "var(--series-income)",
    },
    {
      label: "Despesas",
      value: cur.expense,
      tone: "",
      note: expenseDelta === null ? "sem comparação" : `${expenseDelta >= 0 ? "+" : "−"}${Math.abs(expenseDelta)}% vs ${prevLabel}`,
      noteTone: expenseDelta === null ? "text-muted" : expenseDelta <= 0 ? "text-primary" : "text-danger",
      spark: flow.map((f) => f.expense),
      color: "var(--series-expense)",
    },
    {
      label: "Resultado",
      value: net,
      tone: net < 0 ? "text-danger" : "text-primary",
      note: net >= 0 ? "sobrou no mês" : "faltou no mês",
      noteTone: "text-muted",
      spark: flow.map((f) => f.income - f.expense),
      color: "var(--muted)",
    },
  ];

  const cardNames = new Map((balances.data ?? []).map((a) => [a.account_id, a.name]));
  const invoiceDues = (invoices.data ?? []).map((i) => ({
    id: `inv-${i.id}`,
    type: "expense" as const,
    amount_cents: Number(i.total_cents),
    description: `Fatura ${cardNames.get(i.account_id) ?? "do cartão"}`,
    due_date: i.due_date,
  }));
  const pend = [...(pending.data ?? []), ...invoiceDues].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const toPay = pend.filter((t) => t.type === "expense");
  const overdueTotal = toPay.filter((t) => t.due_date < today).reduce((s, t) => s + t.amount_cents, 0);
  const pill = (due: string) => {
    const d = daysBetween(today, due);
    if (d < 0) return { label: "Atrasada", cls: "bg-danger-soft text-danger" };
    if (d === 0) return { label: "Hoje", cls: "bg-[#fff4db] text-[#7a4f00] dark:bg-[#3a2e12] dark:text-[#f6c55b]" };
    if (d === 1) return { label: "Amanhã", cls: "bg-surface-2 text-muted" };
    return { label: `Em ${d} dias`, cls: "bg-surface-2 text-muted" };
  };

  const byCategory = new Map<string, number>();
  all
    .filter((t) => t.type === "expense" && t.competence_date.startsWith(month))
    .forEach((t) => {
      const name = t.category ? (t.category.parent?.name ?? t.category.name) : "Sem categoria";
      byCategory.set(name, (byCategory.get(name) ?? 0) - t.direction * t.amount_cents);
    });
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = top[0]?.[1] ?? 1;

  const budgets = budgetRows
    .filter((b) => b.budget)
    .map((b) => ({ ...b, used: b.spent + b.planned, status: budgetStatus(b) }))
    .sort((a, b) => b.used / (b.budget ?? 1) - a.used / (a.budget ?? 1))
    .slice(0, 6);
  const reserve = reservePlan((reserves.data ?? []).map((r) => ({ id: r.id, description: r.description, dueDate: r.due_date, cents: r.amount_cents })), today);
  const negSoon = projection?.firstNegative && daysBetween(today, projection.firstNegative) <= 90 ? projection.firstNegative : null;

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
    { id: "kpis", label: "Indicadores do mês" },
    { id: "fluxo", label: "Fluxo de caixa" },
    { id: "pagar", label: "Próximos vencimentos" },
    { id: "orcamento", label: "Orçamento" },
    { id: "planejamento", label: "Planejamento" },
    { id: "despesas", label: "Maiores despesas" },
    { id: "contas", label: "Saldo por conta" },
  ];
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {greeting} · {current.name}
          </p>
          <h1 className="text-[28px] font-extrabold tracking-tight">Visão geral</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-[10px] bg-surface-2 p-[3px] text-sm font-medium">
            <Link href={`${base}/dashboard?mes=${shiftMonth(month, -1)}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-foreground" aria-label="Mês anterior">
              ‹
            </Link>
            <span className="px-2 capitalize">{formatMonthBR(month)}</span>
            <Link href={`${base}/dashboard?mes=${shiftMonth(month, 1)}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-foreground" aria-label="Próximo mês">
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
                  <Link href={st.href} className={`flex items-center gap-2 rounded-xl bg-surface px-3 py-2 ${st.done ? "text-muted line-through" : "font-semibold hover:underline"}`}>
                    <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs ${st.done ? "bg-primary text-primary-fg" : "border border-border"}`}>
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

      {negSoon && projection && (
        <Link href={`${base}/planejamento`} role="alert" className="flex items-start gap-3 rounded-[14px] border border-danger/40 bg-danger-soft p-4 text-sm">
          <Icon name="alert" size={18} className="mt-0.5 text-danger" />
          <span>
            Pelas contas previstas, o saldo fica negativo em <b>{formatDateBR(negSoon)}</b> (mínimo de <b className="tabular-nums">{formatBRL(projection.lowest.balance)}</b>).{" "}
            <span className="underline">Ver planejamento</span>
          </span>
        </Link>
      )}

      <div data-section="kpis" className="stagger grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card lift space-y-1.5 px-[18px] py-4">
            <p className="text-sm text-muted">{k.label}</p>
            <p className={`text-[26px] leading-tight font-semibold tabular-nums ${k.tone}`}>
              <CountUp cents={k.value} />
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-medium ${k.noteTone}`}>{k.note}</span>
              {k.spark && <Spark values={k.spark} color={k.color} />}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3.5 lg:grid-cols-3">
        <section data-section="fluxo" className="card space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Fluxo de caixa</h2>
            <Link href={`${base}/relatorios`} className="text-xs font-medium text-primary hover:underline">
              Relatórios
            </Link>
          </div>
          <FlowChart data={flow} />
        </section>

        <section data-section="pagar" className="card space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Próximos vencimentos</h2>
            <Link href={`${base}/a-pagar`} className="text-xs font-medium text-primary hover:underline">
              Ver todos
            </Link>
          </div>
          {overdueTotal > 0 && (
            <p className="text-xs text-danger">
              <b className="tabular-nums">{formatBRL(overdueTotal)}</b> em contas atrasadas
            </p>
          )}
          {toPay.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nada a pagar nos próximos 30 dias.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {toPay.slice(0, 6).map((t) => {
                const p = pill(t.due_date);
                return (
                  <li key={t.id} className="flex items-center gap-2.5 py-2">
                    <span className="min-w-0 flex-1 truncate">{t.description}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.cls}`}>{p.label}</span>
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums">{formatBRL(t.amount_cents)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-3">
        <section data-section="orcamento" className="card space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Orçamento do mês</h2>
            <Link href={`${base}/orcamento`} className="text-xs font-medium text-primary hover:underline">
              {budgets.length ? "Ver orçamento" : "Definir orçamento"}
            </Link>
          </div>
          {budgets.length === 0 ? (
            <p className="py-4 text-sm text-muted">Defina limites por categoria para acompanhar aqui quanto já foi usado.</p>
          ) : (
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {budgets.map((b) => {
                const p = Math.round((b.used / (b.budget ?? 1)) * 100);
                const color = b.status === "over" ? "var(--danger)" : b.status === "attention" ? "#b7791f" : "var(--series-income)";
                return (
                  <li key={b.categoryId} className="space-y-1.5">
                    <div className="flex justify-between gap-2 text-[13px]">
                      <span className="flex items-center gap-1.5">
                        {b.status === "over" && <Icon name="alert" size={13} className="text-danger" />}
                        {b.name}
                      </span>
                      <span className="text-muted tabular-nums">
                        {formatBRL(b.used)} de {formatBRL(b.budget ?? 0)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.name}: ${p}% do orçamento`}>
                      <div className="bar-grow h-1.5 rounded-full" style={{ width: `${Math.min(p, 100)}%`, background: color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section data-section="planejamento" className="flex flex-col gap-2 rounded-[14px] bg-[#111614] p-5 text-[#eef1ef]">
          <h2 className="text-[15px] font-semibold">Planejamento</h2>
          <p className="text-[13px] text-[#9aa39d]">Saldo previsto em 12 meses</p>
          <p className={`font-display text-[28px] font-semibold tracking-[-0.02em] tabular-nums ${projection && projection.end < 0 ? "text-[#f2876a]" : "text-[#2bc48a]"}`}>
            {projection ? formatBRL(projection.end) : "—"}
          </p>
          <p className="text-[13px] text-[#9aa39d]">
            Reservar por mês: <b className="text-[#eef1ef] tabular-nums">{formatBRL(reserve.totalPerMonth)}</b>
          </p>
          <Link href={`${base}/planejamento`} className="mt-auto inline-flex h-9 items-center self-start rounded-[9px] bg-white/10 px-3 text-[13px] font-medium text-[#eef1ef] hover:bg-white/15">
            Abrir planejamento
          </Link>
        </section>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <section data-section="despesas" className="card space-y-3">
          <h2 className="text-[15px] font-semibold">Maiores despesas do mês</h2>
          {top.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted">
              <span className="mx-auto mb-1 grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-2">
                <Icon name="sprout" size={18} />
              </span>
              <p>Sem despesas neste mês.</p>
            </div>
          ) : (
            <ul className="space-y-2.5 text-sm">
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

        <section data-section="contas" className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Saldo por conta</h2>
            <Link href={`${base}/contas`} className="text-xs font-medium text-primary hover:underline">
              Gerenciar
            </Link>
          </div>
          <ul className="divide-y divide-border text-sm">
            {accounts.map((a) => (
              <li key={a.account_id} className="flex justify-between py-2">
                <span>{a.name}</span>
                <span className={`tabular-nums ${a.balance_cents < 0 ? "text-danger" : ""}`}>{formatBRL(a.balance_cents)}</span>
              </li>
            ))}
            {cards.map((a) => (
              <li key={a.account_id} className="flex justify-between py-2 text-muted">
                <span>{a.name} (cartão)</span>
                <span className="tabular-nums">{formatBRL(a.balance_cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
