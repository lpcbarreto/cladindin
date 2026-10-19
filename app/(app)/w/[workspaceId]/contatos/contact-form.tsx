"use client";

import { useActionState } from "react";
import { createContact } from "./actions";

export function ContactForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState(createContact, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <label className="text-sm">
        Nome
        <input name="name" required className="input mt-1" />
      </label>
      <label className="text-sm">
        CPF ou CNPJ (opcional)
        <input name="document" inputMode="numeric" className="input mt-1" />
      </label>
      <label className="text-sm">
        E-mail
        <input name="email" type="email" className="input mt-1" />
      </label>
      <label className="text-sm">
        Telefone
        <input name="phone" type="tel" className="input mt-1" />
      </label>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isCustomer" /> Cliente
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isSupplier" /> Fornecedor
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>
          Salvar
        </button>
        {state && <p className={`text-sm ${state.ok ? "text-primary" : "text-danger"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
