"use client";

import { useActionState } from "react";
import { deleteAccount } from "./actions";

/** Excluir a conta de vez: pede o nome da conta para confirmar. */
export function DeleteAccount({ workspaceId, id, name, txCount }: { workspaceId: string; id: string; name: string; txCount: number }) {
  const [state, action, pending] = useActionState(deleteAccount, null);
  if (state?.ok) return <p className="text-xs text-primary">{state.message}</p>;
  return (
    <details className="text-left">
      <summary className="cursor-pointer text-xs text-danger hover:underline">Excluir</summary>
      <form action={action} className="msg-in mt-2 w-64 space-y-2 rounded-2xl border border-danger/40 bg-danger-soft p-3 text-xs">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="id" value={id} />
        <p>
          Apaga <b>de vez</b> a conta e {txCount === 1 ? "1 lançamento" : `${txCount} lançamentos`}, com comprovantes, faturas, importações e
          recorrências dela. Não dá para desfazer.
        </p>
        <input name="confirmName" required autoComplete="off" placeholder={`Digite “${name}”`} className="input py-1 text-xs" aria-label="Nome da conta para confirmar" />
        <button className="btn w-full bg-danger py-1.5 text-xs hover:bg-danger" disabled={pending}>
          {pending ? "Excluindo..." : "Excluir definitivamente"}
        </button>
        {state && !state.ok && <p className="text-danger">{state.message}</p>}
      </form>
    </details>
  );
}
