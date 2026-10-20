"use client";

import { useActionState, useEffect, useRef } from "react";
import { addContribution, createGoal } from "./actions";

function Msg({ state }: { state: { ok: boolean; message: string } | null }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-primary" : "shake text-danger"}`}>
      {state.message}
    </p>
  );
}

export function GoalForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState(createGoal, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-[4rem_1fr_10rem_11rem_auto] sm:items-end">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <label className="text-sm">
        <span className="text-muted">Ícone</span>
        <input name="emoji" className="input text-center" placeholder="✈️" maxLength={8} />
      </label>
      <label className="text-sm">
        <span className="text-muted">Nome</span>
        <input name="name" className="input" placeholder="Viagem de férias" required />
      </label>
      <label className="text-sm">
        <span className="text-muted">Quanto</span>
        <input name="target" className="input" inputMode="decimal" placeholder="5.000,00" required />
      </label>
      <label className="text-sm">
        <span className="text-muted">Até (opcional)</span>
        <input name="targetDate" type="date" className="input" />
      </label>
      <button className="btn" disabled={pending}>
        Criar meta
      </button>
      <div className="sm:col-span-5">
        <Msg state={state} />
      </div>
    </form>
  );
}

export function ContributionForm({ workspaceId, goalId, today }: { workspaceId: string; goalId: string; today: string }) {
  const [state, action, pending] = useActionState(addContribution, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="goalId" value={goalId} />
      <select name="kind" className="input w-auto py-1" aria-label="Tipo">
        <option value="in">Guardar</option>
        <option value="out">Retirar</option>
      </select>
      <input name="amount" className="input w-28 py-1" inputMode="decimal" placeholder="200,00" aria-label="Valor" required />
      <input name="date" type="date" defaultValue={today} className="input w-40 py-1" aria-label="Data" />
      <button className="btn-ghost py-1" disabled={pending}>
        Registrar
      </button>
      <Msg state={state} />
    </form>
  );
}
