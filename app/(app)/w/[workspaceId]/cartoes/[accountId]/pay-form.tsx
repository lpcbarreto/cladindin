"use client";

import { useActionState } from "react";
import { payInvoice } from "../actions";

export function PayInvoiceForm({
  workspaceId,
  invoiceId,
  total,
  accounts,
  defaultAccountId,
  defaultDate,
}: {
  workspaceId: string;
  invoiceId: string;
  total: number;
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(payInvoice, null);
  return (
    <form action={action} className="space-y-2 text-sm">
      <p className="font-bold">Pagar fatura</p>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <select name="fromAccountId" defaultValue={defaultAccountId ?? accounts[0]?.id} className="input" aria-label="Pagar com a conta" required>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input name="amount" inputMode="decimal" defaultValue={(Math.max(total, 0) / 100).toFixed(2).replace(".", ",")} className="input" aria-label="Valor pago" />
        <input name="date" type="date" defaultValue={defaultDate} className="input" aria-label="Data do pagamento" />
      </div>
      <button className="btn w-full" disabled={pending || !accounts.length}>
        Registrar pagamento
      </button>
      <p className="text-xs text-muted">Vira uma transferência da conta para o cartão: não conta como despesa de novo.</p>
      {state && <p className={state.ok ? "text-primary" : "text-danger"}>{state.message}</p>}
    </form>
  );
}
