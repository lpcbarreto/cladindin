export type BudgetRow = {
  categoryId: string;
  name: string;
  budget: number | null;
  /** Orçamento vem do padrão mensal (true) ou foi definido só para este mês (false). */
  isDefault: boolean;
  spent: number;
  planned: number;
};

export type BudgetStatus = "ok" | "attention" | "over" | "none";

/** Situação: até 80% ok, até 100% atenção, acima estourado. Previsto conta para o alerta. */
export function budgetStatus(row: Pick<BudgetRow, "budget" | "spent" | "planned">): BudgetStatus {
  if (!row.budget) return "none";
  const used = row.spent + row.planned;
  if (used > row.budget) return "over";
  if (used >= row.budget * 0.8) return "attention";
  return "ok";
}

/**
 * Junta orçamentos (padrão + específico do mês, este vence) com o realizado/previsto por
 * categoria principal. Gastos de subcategorias somam na categoria principal.
 */
export function buildBudget(
  categories: { id: string; name: string; parent_id: string | null; kind: string }[],
  budgets: { category_id: string; month: string | null; amount_cents: number }[],
  txs: { category_id: string | null; status: string; signed: number }[],
  month: string,
): BudgetRow[] {
  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id ?? c.id]));
  const tops = categories.filter((c) => !c.parent_id && c.kind === "expense");
  const spent = new Map<string, { spent: number; planned: number }>();
  for (const t of txs) {
    if (!t.category_id || t.status === "cancelled") continue;
    const top = parentOf.get(t.category_id);
    if (!top) continue;
    const s = spent.get(top) ?? { spent: 0, planned: 0 };
    if (t.status === "paid") s.spent += -t.signed;
    else s.planned += -t.signed;
    spent.set(top, s);
  }
  const monthKey = `${month}-01`;
  return tops
    .map((c) => {
      const specific = budgets.find((b) => b.category_id === c.id && b.month === monthKey);
      const def = budgets.find((b) => b.category_id === c.id && b.month === null);
      const s = spent.get(c.id) ?? { spent: 0, planned: 0 };
      return {
        categoryId: c.id,
        name: c.name,
        budget: specific?.amount_cents ?? def?.amount_cents ?? null,
        isDefault: !specific && !!def,
        spent: s.spent,
        planned: s.planned,
      };
    })
    .sort((a, b) => Number(b.budget !== null) - Number(a.budget !== null) || b.spent - a.spent || a.name.localeCompare(b.name, "pt-BR"));
}
