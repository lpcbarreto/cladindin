"use client";

import { useActionState } from "react";
import { deleteMyAccount, updateProfileName } from "./account-actions";

export function ProfileNameForm({ name }: { name: string | null }) {
  const [state, action, pending] = useActionState(updateProfileName, null);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex-1 text-sm">
        <span className="text-muted">Como prefere ser chamado (opcional)</span>
        <input name="name" defaultValue={name ?? ""} maxLength={120} autoComplete="nickname" className="input mt-1" />
      </label>
      <button className="btn-ghost" disabled={pending}>
        Salvar
      </button>
      {state && (
        <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-primary" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(deleteMyAccount, null);
  return (
    <form action={action} className="space-y-2">
      <label className="block text-sm">
        <span className="text-muted">Para confirmar, digite o e-mail da conta ({email})</span>
        <input name="confirmEmail" type="email" required autoComplete="off" className="input mt-1 sm:max-w-sm" />
      </label>
      <button className="btn bg-danger hover:bg-danger" disabled={pending}>
        {pending ? "Excluindo..." : "Excluir minha conta definitivamente"}
      </button>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
