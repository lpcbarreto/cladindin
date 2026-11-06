"use client";

import { useActionState } from "react";
import { setApprovalThreshold } from "./actions";

export function ThresholdForm({ workspaceId, value }: { workspaceId: string; value: string }) {
  const [state, action, pending] = useActionState(setApprovalThreshold, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <label className="text-sm">
        Pedir aprovação para despesas acima de (R$)
        <input name="threshold" inputMode="decimal" defaultValue={value} placeholder="Vazio = não pedir" className="input mt-1 w-56" />
      </label>
      <button className="btn" disabled={pending}>
        Salvar
      </button>
      {state && <p className={`w-full text-sm ${state.ok ? "text-primary" : "text-danger"}`}>{state.message}</p>}
    </form>
  );
}
