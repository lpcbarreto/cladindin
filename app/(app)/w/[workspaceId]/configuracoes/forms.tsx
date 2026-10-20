"use client";

import { useActionState } from "react";
import { createInvite, createWorkspace, deleteWorkspace, saveNotificationPrefs } from "./actions";
import { loadDemoData } from "./demo";

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState(createInvite, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="email" type="email" required placeholder="email@exemplo.com" className="input" />
        <select name="role" defaultValue="editor" className="input sm:w-44">
          <option value="admin">Administrador</option>
          <option value="editor">Editor</option>
          <option value="viewer">Leitor</option>
        </select>
        <button className="btn" disabled={pending}>
          Convidar
        </button>
      </div>
      {state && (
        <div className={`text-sm ${state.ok ? "" : "text-danger"}`}>
          <p>{state.message}</p>
          {state.link && <code className="mt-1 block break-all rounded bg-background p-2 text-xs">{state.link}</code>}
        </div>
      )}
    </form>
  );
}

export function NewWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, null);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row">
      <input name="name" required placeholder="Ex.: Minha Empresa" className="input" />
      <select name="kind" defaultValue="pj" className="input sm:w-44">
        <option value="pf">Pessoa física</option>
        <option value="pj">Empresa</option>
      </select>
      <button className="btn" disabled={pending}>
        Criar
      </button>
      {state && !state.ok && <p className="text-sm text-danger">{state.message}</p>}
    </form>
  );
}

export function DeleteWorkspaceForm({ workspaceId, name }: { workspaceId: string; name: string }) {
  const [state, action, pending] = useActionState(deleteWorkspace, null);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input name="confirmName" required placeholder={`Digite “${name}” para confirmar`} className="input sm:max-w-xs" autoComplete="off" />
      <button className="btn bg-danger hover:bg-danger" disabled={pending}>
        {pending ? "Excluindo..." : "Excluir definitivamente"}
      </button>
      {state && !state.ok && <p className="text-sm text-danger">{state.message}</p>}
    </form>
  );
}

export function DemoDataForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState(loadDemoData, null);
  return (
    <section className="card space-y-3">
      <h2 className="font-medium">Dados de demonstração</h2>
      <p className="text-sm text-muted">
        Cria contas, um cartão, lançamentos de 3 meses, uma recorrência, uma regra e um orçamento fictícios para conhecer o sistema. Funciona só
        em workspace sem lançamentos.
      </p>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <button className="btn-ghost" disabled={pending}>
          {pending ? "Criando..." : "Carregar dados de demonstração"}
        </button>
        {state && <p className={`text-sm ${state.ok ? "text-primary" : "text-danger"}`}>{state.message}</p>}
      </form>
    </section>
  );
}

export function NotificationPrefsForm({ prefs }: { prefs: { due_alerts: boolean; weekly_summary: boolean; days_before: number } }) {
  const [state, action, pending] = useActionState(saveNotificationPrefs, null);
  return (
    <form action={action} className="space-y-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" name="dueAlerts" defaultChecked={prefs.due_alerts} />
        Avisar por e-mail as contas que vão vencer, com
        <select name="daysBefore" defaultValue={prefs.days_before} className="input w-auto py-1" aria-label="Dias de antecedência">
          {[0, 1, 2, 3, 5, 7].map((d) => (
            <option key={d} value={d}>
              {d === 0 ? "no dia" : d === 1 ? "1 dia" : `${d} dias`}
            </option>
          ))}
        </select>
        de antecedência
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="weeklySummary" defaultChecked={prefs.weekly_summary} />
        Resumo semanal toda segunda-feira
      </label>
      <div className="flex items-center gap-3">
        <button className="btn-ghost" disabled={pending}>
          Salvar avisos
        </button>
        {state && <span className={state.ok ? "text-primary" : "text-danger"}>{state.message}</span>}
      </div>
    </form>
  );
}
