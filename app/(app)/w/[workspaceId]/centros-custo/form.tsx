"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCostCenter } from "./actions";

export function CostCenterForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState(createCostCenter, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <label className="min-w-0 flex-1 text-sm">
        Nome
        <input name="name" required maxLength={60} placeholder="Ex.: Obra Rua das Flores, Filial Centro, Casa" className="input mt-1" />
      </label>
      <button className="btn" disabled={pending}>
        Criar
      </button>
      {state && <p className={`w-full text-sm ${state.ok ? "text-primary" : "text-danger"}`}>{state.message}</p>}
    </form>
  );
}
