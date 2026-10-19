"use client";

import { useActionState } from "react";
import { reapplyRules } from "./actions";

export function ReapplyForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState(reapplyRules, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 text-sm">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <span className="font-semibold">Reaplicar regras aos lançamentos existentes</span>
      <select name="mode" defaultValue="empty" className="input w-auto">
        <option value="empty">Só os sem categoria/contato</option>
        <option value="all">Todos (sobrescreve escolhas manuais)</option>
      </select>
      <button className="btn-ghost" disabled={pending}>
        {pending ? "Aplicando..." : "Reaplicar"}
      </button>
      {state && <span className={state.ok ? "text-primary" : "text-danger"}>{state.message}</span>}
    </form>
  );
}
