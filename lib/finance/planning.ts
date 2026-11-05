// Planejamento de contas futuras: calendário mês a mês, simulador "e se" e reserva mensal.
// Funções puras (rodam no servidor e no navegador). Valores sempre em centavos.

export type PlanItem = {
  id: string;
  date: string;
  cents: number; // + entrada, − saída
  description: string;
  kind: "lancamento" | "fatura" | "simulacao";
  recurring?: boolean;
  installment?: string | null;
};

export type PlanMonth = {
  month: string; // AAAA-MM
  income: number;
  expense: number; // positivo
  net: number;
  startBalance: number;
  endBalance: number;
  lowest: number; // menor saldo do mês (considerando a ordem das datas)
  items: PlanItem[];
};

export const monthOf = (iso: string) => iso.slice(0, 7);

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Mesma data N meses depois, sem passar do fim do mês (31/01 + 1 mês = 28 ou 29/02). */
export function addMonthsToDate(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + delta, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Divide um total em N parcelas iguais; a diferença de centavos vai na última. */
export function splitCents(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? totalCents - base * (count - 1) : base));
}

/**
 * Agrupa o que está previsto por mês, a partir do saldo de hoje. Atrasados (antes de hoje)
 * entram no mês atual: ainda vão sair ou entrar da conta.
 */
export function monthlyPlan(startBalance: number, today: string, months: number, items: PlanItem[]): PlanMonth[] {
  const first = monthOf(today);
  const keys = Array.from({ length: months }, (_, i) => addMonths(first, i));
  const byMonth = new Map(keys.map((k) => [k, [] as PlanItem[]]));
  for (const it of items) {
    const date = it.date < today ? today : it.date;
    const list = byMonth.get(monthOf(date));
    if (list) list.push({ ...it, date });
  }
  let balance = startBalance;
  return keys.map((month) => {
    const list = byMonth.get(month)!.sort((a, b) => a.date.localeCompare(b.date) || b.cents - a.cents);
    const startBalanceM = balance;
    let lowest = balance;
    let income = 0;
    let expense = 0;
    for (const it of list) {
      balance += it.cents;
      if (it.cents > 0) income += it.cents;
      else expense -= it.cents;
      if (balance < lowest) lowest = balance;
    }
    return { month, income, expense, net: income - expense, startBalance: startBalanceM, endBalance: balance, lowest, items: list };
  });
}

export type Simulation = {
  description: string;
  totalCents: number; // positivo
  kind: "expense" | "income";
  installments: number;
  firstDate: string;
};

/** Parcelas do "e se" como itens do plano (não grava nada). */
export function simulationItems(sim: Simulation): PlanItem[] {
  if (!sim.totalCents || sim.totalCents <= 0 || sim.installments < 1) return [];
  const parts = splitCents(sim.totalCents, sim.installments);
  const sign = sim.kind === "income" ? 1 : -1;
  return parts.map((c, i) => ({
    id: `sim-${i}`,
    date: addMonthsToDate(sim.firstDate, i),
    cents: sign * c,
    description: sim.description || "Simulação",
    kind: "simulacao" as const,
    installment: sim.installments > 1 ? `${i + 1}/${sim.installments}` : null,
  }));
}

/** Primeiro mês em que o saldo fica negativo (pelo menor saldo do mês), ou null. */
export function firstNegativeMonth(plan: PlanMonth[]): string | null {
  return plan.find((m) => m.lowest < 0)?.month ?? null;
}

export type ReserveRow = { id: string; description: string; dueDate: string; cents: number; months: number; perMonth: number; late: boolean };

/** Meses até o vencimento contando o atual (mínimo 1). Ex.: hoje 05/11, vence 10/01 → nov, dez, jan = 3. */
export function monthsToDue(today: string, due: string): number {
  const [ty, tm] = today.split("-").map(Number);
  const [dy, dm] = due.split("-").map(Number);
  return Math.max(1, (dy - ty) * 12 + (dm - tm) + 1);
}

/** Quanto separar por mês para cada conta grande até o vencimento. */
export function reservePlan(items: { id: string; description: string; dueDate: string; cents: number }[], today: string): { rows: ReserveRow[]; totalPerMonth: number } {
  const rows = items
    .map((it) => {
      const late = it.dueDate < today;
      const months = late ? 1 : monthsToDue(today, it.dueDate);
      return { ...it, months, perMonth: Math.ceil(it.cents / months), late };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { rows, totalPerMonth: rows.reduce((s, r) => s + r.perMonth, 0) };
}
