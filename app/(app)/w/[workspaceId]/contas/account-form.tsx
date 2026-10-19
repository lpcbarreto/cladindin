"use client";

import { useActionState, useState } from "react";
import { ACCOUNT_TYPE_LABEL } from "@/lib/finance/labels";
import { createAccount } from "./actions";

export function AccountForm({
  workspaceId,
  paymentAccounts,
}: {
  workspaceId: string;
  paymentAccounts: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createAccount, null);
  const [type, setType] = useState("checking");
  const isCard = type === "credit_card";

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <label className="text-sm">
        Nome
        <input name="name" required className="input mt-1" placeholder="Ex.: Nubank, Itaú PJ" />
      </label>
      <label className="text-sm">
        Tipo
        <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="input mt-1">
          {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {!isCard && (
        <>
          <label className="text-sm">
            Saldo inicial (R$)
            <input name="initialBalance" inputMode="decimal" className="input mt-1" placeholder="0,00" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-sm">
              Banco
              <input name="bankCode" className="input mt-1" placeholder="260" />
            </label>
            <label className="text-sm">
              Agência
              <input name="branch" className="input mt-1" />
            </label>
            <label className="text-sm">
              Conta
              <input name="number" className="input mt-1" />
            </label>
          </div>
        </>
      )}
      {isCard && (
        <>
          <label className="text-sm">
            Limite (R$)
            <input name="limit" inputMode="decimal" className="input mt-1" placeholder="5.000,00" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              Dia de fechamento
              <input name="closingDay" type="number" min={1} max={31} required className="input mt-1" />
            </label>
            <label className="text-sm">
              Dia de vencimento
              <input name="dueDay" type="number" min={1} max={31} required className="input mt-1" />
            </label>
          </div>
          <label className="text-sm sm:col-span-2">
            Conta de pagamento padrão
            <select name="paymentAccountId" className="input mt-1" defaultValue="">
              <option value="">Nenhuma</option>
              {paymentAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn" disabled={pending}>
          Salvar conta
        </button>
        {state && <p className={`text-sm ${state.ok ? "text-primary" : "text-danger"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
