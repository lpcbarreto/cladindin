"use client";

import { useActionState } from "react";
import { createCategory } from "./actions";

export function CategoryForm({
  workspaceId,
  parents,
}: {
  workspaceId: string;
  parents: { id: string; name: string; kind: string }[];
}) {
  const [state, action, pending] = useActionState(createCategory, null);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <label className="flex-1 text-sm">
        Nome
        <input name="name" required className="input mt-1" />
      </label>
      <label className="text-sm">
        Tipo
        <select name="kind" className="input mt-1">
          <option value="expense">Despesa</option>
          <option value="income">Receita</option>
        </select>
      </label>
      <label className="text-sm">
        Subcategoria de
        <select name="parentId" defaultValue="" className="input mt-1">
          <option value="">Nenhuma (principal)</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.kind === "income" ? "receita" : "despesa"})
            </option>
          ))}
        </select>
      </label>
      <button className="btn" disabled={pending}>
        Adicionar
      </button>
      {state && <p className={`text-sm ${state.ok ? "text-primary" : "text-danger"}`}>{state.message}</p>}
    </form>
  );
}
