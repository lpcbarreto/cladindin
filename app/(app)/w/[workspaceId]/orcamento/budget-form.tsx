"use client";

import { useActionState } from "react";
import { saveBudget } from "./actions";

export function BudgetForm({
  workspaceId,
  categoryId,
  month,
  amount,
  isDefault,
}: {
  workspaceId: string;
  categoryId: string;
  month: string;
  amount: number | null;
  isDefault: boolean;
}) {
  const [state, action, pending] = useActionState(saveBudget, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-xs">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="month" value={month} />
      <input
        name="amount"
        inputMode="decimal"
        defaultValue={amount ? (amount / 100).toFixed(2).replace(".", ",") : ""}
        placeholder="Sem limite"
        className="input w-28 py-1 text-right"
        aria-label="Limite do orçamento"
      />
      <select name="scope" defaultValue={amount && !isDefault ? "month" : "default"} className="input w-auto py-1" aria-label="Vale para">
        <option value="default">todo mês</option>
        <option value="month">só este mês</option>
      </select>
      <button className="btn-ghost px-3 py-1" disabled={pending}>
        Salvar
      </button>
      {state && <span className={state.ok ? "text-primary" : "text-danger"}>{state.message}</span>}
    </form>
  );
}
