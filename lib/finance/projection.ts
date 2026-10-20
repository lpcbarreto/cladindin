import { addDays } from "@/lib/finance/dates";

export type ProjectionEvent = { date: string; cents: number; description: string };
export type ProjectionPoint = { date: string; balance: number };

/**
 * Saldo dia a dia a partir de hoje. Eventos atrasados (data < hoje) contam hoje:
 * ainda vão sair (ou entrar) da conta.
 */
export function projectBalance(startCents: number, today: string, days: number, events: ProjectionEvent[]) {
  const byDay = new Map<string, number>();
  for (const e of events) {
    const d = e.date < today ? today : e.date;
    byDay.set(d, (byDay.get(d) ?? 0) + e.cents);
  }
  const points: ProjectionPoint[] = [];
  let balance = startCents;
  let lowest: ProjectionPoint = { date: today, balance: startCents };
  let firstNegative: string | null = null;
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    balance += byDay.get(date) ?? 0;
    points.push({ date, balance });
    if (balance < lowest.balance) lowest = { date, balance };
    if (balance < 0 && !firstNegative) firstNegative = date;
  }
  return { points, lowest, firstNegative, end: balance };
}
