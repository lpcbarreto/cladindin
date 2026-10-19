"use client";

import { useActionState, useState } from "react";
import { formatBRL, parseMoneyToCents } from "@/lib/finance/money";
import { settleTransaction } from "./actions";

const cents = (s: string) => {
  try {
    return s.trim() ? Math.abs(parseMoneyToCents(s)) : 0;
  } catch {
    return 0;
  }
};

export function SettleForm({
  workspaceId,
  id,
  amountCents,
  accountId,
  accounts,
  today,
  kind,
}: {
  workspaceId: string;
  id: string;
  amountCents: number;
  accountId: string;
  accounts: { id: string; name: string }[];
  today: string;
  kind: "income" | "expense";
}) {
  const [state, action, pending] = useActionState(settleTransaction, null);
  const initial = (amountCents / 100).toFixed(2).replace(".", ",");
  const [principal, setPrincipal] = useState(initial);
  const [interest, setInterest] = useState("");
  const [fine, setFine] = useState("");
  const [discount, setDiscount] = useState("");
  const total = cents(principal) + cents(interest) + cents(fine);
  const remaining = amountCents - cents(principal) - cents(discount);

  if (state?.ok) return <p className="text-sm text-primary">{state.message}</p>;

  return (
    <form action={action} className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="id" value={id} />
      <label>
        Data
        <input name="paidDate" type="date" defaultValue={today} className="input mt-1" />
      </label>
      <label className="sm:col-span-2 lg:col-span-1">
        {kind === "income" ? "Receber em" : "Pagar com"}
        <select name="accountId" defaultValue={accountId} className="input mt-1">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Valor {kind === "income" ? "recebido" : "pago"}
        <input name="principal" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} className="input mt-1" />
      </label>
      <label>
        Juros
        <input name="interest" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="0,00" className="input mt-1" />
      </label>
      <label>
        Multa
        <input name="fine" inputMode="decimal" value={fine} onChange={(e) => setFine(e.target.value)} placeholder="0,00" className="input mt-1" />
      </label>
      <label>
        Desconto
        <input name="discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0,00" className="input mt-1" />
      </label>
      <label className="sm:col-span-2 lg:col-span-3">
        Comprovante (opcional)
        <input name="receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" className="input mt-1 py-1.5" />
      </label>
      <div className="flex flex-col justify-end gap-1 sm:col-span-1 lg:col-span-3">
        <p className="text-xs text-muted">
          Total {kind === "income" ? "recebido" : "pago"}: <b className="text-foreground tabular-nums">{formatBRL(total)}</b>
          {remaining > 0 && (
            <>
              {" "}
              · saldo de <b className="text-foreground tabular-nums">{formatBRL(remaining)}</b> continua previsto
            </>
          )}
          {remaining < 0 && <span className="text-danger"> · valor + desconto passa do lançamento</span>}
        </p>
        <button className="btn self-start" disabled={pending || remaining < 0}>
          {pending ? "Salvando..." : "Confirmar baixa"}
        </button>
        {state && !state.ok && <p className="text-danger">{state.message}</p>}
      </div>
    </form>
  );
}
