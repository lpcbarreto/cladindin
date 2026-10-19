"use client";

import { useActionState } from "react";
import { createInvite, createWorkspace } from "./actions";

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
