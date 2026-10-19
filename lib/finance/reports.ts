// Agregações dos relatórios. Funções puras: recebem lançamentos já filtrados pelo workspace.

export type Basis = "competencia" | "caixa";

export type ReportTx = {
  type: "income" | "expense";
  direction: number;
  amount_cents: number;
  status: "planned" | "paid" | "cancelled";
  competence_date: string;
  due_date: string;
  paid_date: string | null;
  category: { name: string; parent: { name: string } | null } | null;
  contact: { name: string } | null;
  cost_center: { name: string } | null;
};

/** Valor com sinal do ponto de vista do resultado: receita +, despesa − (estorno reduz a despesa). */
export const signed = (t: Pick<ReportTx, "type" | "direction" | "amount_cents">) =>
  t.type === "income" ? t.amount_cents : t.direction * t.amount_cents;

/** Data que conta no regime escolhido. Caixa: pagamento (realizado) ou vencimento (previsto). */
export function dateFor(t: ReportTx, basis: Basis): string {
  if (basis === "competencia") return t.competence_date;
  return t.status === "paid" && t.paid_date ? t.paid_date : t.due_date;
}

export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (out.length > 240) break;
  }
  return out;
}

export type FlowRow = {
  month: string;
  income: number;
  expense: number;
  net: number;
  incomePlanned: number;
  expensePlanned: number;
  netPlanned: number;
};

/** Fluxo mensal: realizado (pago) e previsto (realizado + em aberto). Despesas em valor positivo. */
export function monthlyFlow(txs: ReportTx[], months: string[], basis: Basis): FlowRow[] {
  const rows = new Map(
    months.map((m) => [m, { month: m, income: 0, expense: 0, net: 0, incomePlanned: 0, expensePlanned: 0, netPlanned: 0 }]),
  );
  for (const t of txs) {
    if (t.status === "cancelled") continue;
    const r = rows.get(dateFor(t, basis).slice(0, 7));
    if (!r) continue;
    const v = signed(t);
    const isIncome = t.type === "income";
    if (t.status === "paid") {
      if (isIncome) r.income += v;
      else r.expense -= v;
    }
    if (isIncome) r.incomePlanned += v;
    else r.expensePlanned -= v;
  }
  return [...rows.values()].map((r) => ({ ...r, net: r.income - r.expense, netPlanned: r.incomePlanned - r.expensePlanned }));
}

export type GroupRow = { name: string; total: number; share: number; children: { name: string; total: number }[] };

/** Total por categoria (pai › filha), contato ou centro de custo, somente realizado. Despesa em valor positivo. */
export function groupBy(
  txs: ReportTx[],
  kind: "income" | "expense",
  dimension: "categoria" | "contato" | "centro",
): GroupRow[] {
  const groups = new Map<string, { total: number; children: Map<string, number> }>();
  for (const t of txs) {
    if (t.status !== "paid" || t.type !== kind) continue;
    const v = kind === "income" ? signed(t) : -signed(t);
    let parent: string;
    let child: string | null = null;
    if (dimension === "categoria") {
      parent = t.category ? (t.category.parent?.name ?? t.category.name) : "Sem categoria";
      child = t.category?.parent ? t.category.name : null;
    } else if (dimension === "contato") parent = t.contact?.name ?? "Sem contato";
    else parent = t.cost_center?.name ?? "Sem centro de custo";
    const g = groups.get(parent) ?? { total: 0, children: new Map() };
    g.total += v;
    if (child) g.children.set(child, (g.children.get(child) ?? 0) + v);
    groups.set(parent, g);
  }
  const sum = [...groups.values()].reduce((a, g) => a + g.total, 0) || 1;
  return [...groups.entries()]
    .map(([name, g]) => ({
      name,
      total: g.total,
      share: g.total / sum,
      children: [...g.children.entries()].map(([n, total]) => ({ name: n, total })).sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}

/** Matriz categoria × mês (realizado), para o comparativo. */
export function categoryByMonth(txs: ReportTx[], months: string[], kind: "income" | "expense", basis: Basis) {
  const map = new Map<string, Map<string, number>>();
  for (const t of txs) {
    if (t.status !== "paid" || t.type !== kind) continue;
    const m = dateFor(t, basis).slice(0, 7);
    if (!months.includes(m)) continue;
    const name = t.category ? (t.category.parent?.name ?? t.category.name) : "Sem categoria";
    const row = map.get(name) ?? new Map();
    row.set(m, (row.get(m) ?? 0) + (kind === "income" ? signed(t) : -signed(t)));
    map.set(name, row);
  }
  return [...map.entries()]
    .map(([name, row]) => ({ name, values: months.map((m) => row.get(m) ?? 0), total: [...row.values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
}

// DRE simplificado: cada linha agrupa categorias principais pelo nome (categorias padrão PJ)
const DRE_LINES: { label: string; kind: "income" | "expense"; match: RegExp }[] = [
  { label: "Receita operacional", kind: "income", match: /receita operacional|vendas|servi/i },
  { label: "(−) Impostos sobre receita", kind: "expense", match: /^impostos/i },
  { label: "(−) Custos", kind: "expense", match: /^custos/i },
  { label: "(−) Despesas com pessoal", kind: "expense", match: /pessoal/i },
  { label: "(−) Despesas administrativas", kind: "expense", match: /administrativ/i },
  { label: "(−) Despesas comerciais", kind: "expense", match: /comerciai/i },
  { label: "(+) Receitas financeiras", kind: "income", match: /financeir/i },
  { label: "(−) Despesas financeiras", kind: "expense", match: /financeir/i },
];

export type DreRow = { label: string; value: number; kind: "line" | "subtotal" | "result" };

export function dre(txs: ReportTx[]): DreRow[] {
  const totals = new Map<string, number>();
  let otherIncome = 0;
  let otherExpense = 0;
  for (const t of txs) {
    if (t.status !== "paid") continue;
    const top = t.category ? (t.category.parent?.name ?? t.category.name) : "";
    const line = DRE_LINES.find((l) => l.kind === t.type && l.match.test(top));
    const v = t.type === "income" ? signed(t) : -signed(t);
    if (line) totals.set(line.label, (totals.get(line.label) ?? 0) + v);
    else if (t.type === "income") otherIncome += v;
    else otherExpense += v;
  }
  const g = (label: string) => totals.get(label) ?? 0;
  // Evita "−R$ 0,00" (zero negativo)
  const z = (n: number) => (n === 0 ? 0 : n);
  const gross = g("Receita operacional");
  const net = gross - g("(−) Impostos sobre receita");
  const grossProfit = net - g("(−) Custos");
  const opex = g("(−) Despesas com pessoal") + g("(−) Despesas administrativas") + g("(−) Despesas comerciais");
  const operating = grossProfit - opex;
  const financial = g("(+) Receitas financeiras") - g("(−) Despesas financeiras");
  const result = operating + financial + otherIncome - otherExpense;
  return [
    { label: "Receita operacional bruta", value: z(gross), kind: "line" },
    { label: "(−) Impostos sobre receita", value: z(-g("(−) Impostos sobre receita")), kind: "line" },
    { label: "Receita líquida", value: z(net), kind: "subtotal" },
    { label: "(−) Custos", value: z(-g("(−) Custos")), kind: "line" },
    { label: "Lucro bruto", value: z(grossProfit), kind: "subtotal" },
    { label: "(−) Despesas com pessoal", value: z(-g("(−) Despesas com pessoal")), kind: "line" },
    { label: "(−) Despesas administrativas", value: z(-g("(−) Despesas administrativas")), kind: "line" },
    { label: "(−) Despesas comerciais", value: z(-g("(−) Despesas comerciais")), kind: "line" },
    { label: "Resultado operacional", value: z(operating), kind: "subtotal" },
    { label: "(+/−) Resultado financeiro", value: z(financial), kind: "line" },
    { label: "(+/−) Outras receitas e despesas", value: z(otherIncome - otherExpense), kind: "line" },
    { label: "Resultado do período", value: z(result), kind: "result" },
  ];
}

/** Saldo diário: saldo inicial + movimentos pagos (inclui transferências entre contas filtradas). */
export function balanceSeries(
  opening: number,
  moves: { date: string; amount: number }[],
  from: string,
  to: string,
): { date: string; balance: number }[] {
  const byDay = new Map<string, number>();
  for (const m of moves) byDay.set(m.date, (byDay.get(m.date) ?? 0) + m.amount);
  const out: { date: string; balance: number }[] = [];
  let bal = opening;
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    bal += byDay.get(k) ?? 0;
    out.push({ date: k, balance: bal });
    if (out.length > 1500) break;
  }
  return out;
}
