/** Meses entre hoje e a data-alvo, contando o mês corrente se ainda faltam dias (mínimo 1). */
export function monthsUntil(today: string, target: string): number {
  const [ty, tm, td] = today.split("-").map(Number);
  const [gy, gm, gd] = target.split("-").map(Number);
  const months = (gy - ty) * 12 + (gm - tm) + (gd >= td ? 1 : 0);
  return Math.max(1, months);
}

export type GoalPlan = { remaining: number; percent: number; perMonth: number | null; done: boolean; late: boolean };

/** Quanto falta, quanto já foi (%) e quanto guardar por mês para chegar na data. */
export function goalPlan(savedCents: number, targetCents: number, targetDate: string | null, today: string): GoalPlan {
  const remaining = Math.max(0, targetCents - savedCents);
  const percent = Math.min(100, Math.round((savedCents / targetCents) * 100));
  const done = remaining === 0;
  const late = !!targetDate && targetDate < today && !done;
  const perMonth = targetDate && !done ? Math.ceil(remaining / (late ? 1 : monthsUntil(today, targetDate))) : null;
  return { remaining, percent: Math.max(0, percent), perMonth, done, late };
}
