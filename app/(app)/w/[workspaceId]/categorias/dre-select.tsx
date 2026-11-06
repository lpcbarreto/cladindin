"use client";

import { setDreLine } from "./actions";

const OPTIONS: [string, string][] = [
  ["", "DRE: automático pelo nome"],
  ["receita", "DRE: receita operacional"],
  ["deducao", "DRE: impostos sobre a receita"],
  ["custo", "DRE: custos"],
  ["despesa", "DRE: despesas administrativas"],
  ["financeiro", "DRE: resultado financeiro"],
  ["fora", "Não entra na DRE"],
];

/** Escolhe a linha da DRE da categoria; salva ao trocar. */
export function DreSelect({ workspaceId, id, value }: { workspaceId: string; id: string; value: string | null }) {
  return (
    <form action={setDreLine}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="id" value={id} />
      <select
        name="dreLine"
        defaultValue={value ?? ""}
        aria-label="Linha da DRE"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="max-w-44 rounded-md border border-border bg-transparent px-1 py-0.5 text-xs text-muted"
      >
        {OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </form>
  );
}
