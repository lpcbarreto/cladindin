"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { CategoryOption, Option } from "@/lib/transactions";
import { createTransaction, updateTransaction } from "./actions";

type Initial = {
  id: string;
  type: "income" | "expense";
  description: string;
  amount: string;
  dueDate: string;
  competenceDate: string;
  paidDate: string;
  status: "planned" | "paid" | "cancelled";
  accountId: string;
  categoryId: string;
  contactId: string;
  notes: string;
};

export function TransactionForm({
  workspaceId,
  options,
  defaultDate,
  initial,
}: {
  workspaceId: string;
  options: { accounts: Option[]; categories: CategoryOption[]; contacts: Option[] };
  defaultDate: string;
  initial?: Initial;
}) {
  const editing = Boolean(initial);
  const [state, action, pending] = useActionState(editing ? updateTransaction : createTransaction, null);
  const [type, setType] = useState<"income" | "expense" | "transfer">(initial?.type ?? "expense");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && !editing) formRef.current?.reset();
  }, [state, editing]);

  const cats = options.categories.filter((c) => c.kind === type);

  return (
    <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <fieldset className="flex gap-1 rounded-full bg-surface-2 p-1 text-sm font-semibold sm:col-span-2 lg:col-span-4">
        <legend className="sr-only">Tipo</legend>
        {(editing ? (["expense", "income"] as const) : (["expense", "income", "transfer"] as const)).map((t) => (
          <label key={t} className={`flex-1 cursor-pointer rounded-full px-2 py-1.5 text-center transition ${type === t ? "bg-surface shadow-sm" : "text-muted hover:text-foreground"}`}>
            <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
            {t === "expense" ? "Despesa" : t === "income" ? "Receita" : "Transferência"}
          </label>
        ))}
      </fieldset>

      <label className="text-sm sm:col-span-2">
        Descrição
        <input name="description" required defaultValue={initial?.description} className="input mt-1" />
      </label>
      <label className="text-sm">
        Valor (R$)
        <input name="amount" required inputMode="decimal" defaultValue={initial?.amount} placeholder="0,00" className="input mt-1" />
      </label>
      <label className="text-sm">
        {type === "transfer" ? "Data" : "Vencimento"}
        <input name="dueDate" type="date" required defaultValue={initial?.dueDate ?? defaultDate} className="input mt-1" />
      </label>

      {type === "transfer" ? (
        <>
          <label className="text-sm sm:col-span-1 lg:col-span-2">
            De
            <select key="from" name="fromAccountId" required defaultValue={options.accounts[0]?.id} className="input mt-1">
              {options.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-1 lg:col-span-2">
            Para
            <select key="to" name="toAccountId" required defaultValue={options.accounts[1]?.id} className="input mt-1">
              {options.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <label className="text-sm">
            Conta
            <select key="account" name="accountId" required defaultValue={initial?.accountId} className="input mt-1">
              {options.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Categoria
            <select name="categoryId" defaultValue={initial?.categoryId ?? ""} className="input mt-1">
              <option value="">Sem categoria</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {type === "income" ? "Cliente" : "Fornecedor"}
            <select name="contactId" defaultValue={initial?.contactId ?? ""} className="input mt-1">
              <option value="">Nenhum</option>
              {options.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Competência
            <input name="competenceDate" type="date" defaultValue={initial?.competenceDate} className="input mt-1" />
          </label>
          <label className="text-sm sm:col-span-2 lg:col-span-4">
            Observações
            <input name="notes" defaultValue={initial?.notes} className="input mt-1" />
          </label>
        </>
      )}

      {editing ? (
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          <label className="text-sm">
            Status
            <select name="status" defaultValue={initial!.status} className="input mt-1">
              <option value="planned">Previsto</option>
              <option value="paid">Pago</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>
          <label className="text-sm">
            Data do pagamento
            <input name="paidDate" type="date" defaultValue={initial!.paidDate} className="input mt-1" />
          </label>
        </div>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="paid" defaultChecked /> Já foi pago/recebido
        </label>
      )}

      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <button className="btn" disabled={pending}>
          {editing ? "Salvar alterações" : "Adicionar"}
        </button>
        {state && <p className={`text-sm ${state.ok ? "text-primary" : "text-danger"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
