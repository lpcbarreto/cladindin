"use client";

import { useActionState, useState } from "react";
import type { CategoryOption, Option } from "@/lib/transactions";
import { createCategorizationRule } from "./actions";

export function CategorizationRuleForm({
  workspaceId,
  options,
  defaults,
  compact,
}: {
  workspaceId: string;
  options: { accounts: Option[]; categories: CategoryOption[]; contacts: Option[] };
  defaults?: { pattern?: string; categoryId?: string; contactId?: string; direction?: "any" | "in" | "out" };
  /** Versão curta (usada na edição do lançamento). */
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(createCategorizationRule, null);
  const [direction, setDirection] = useState(defaults?.direction ?? "any");
  const cats = options.categories.filter((c) => direction === "any" || c.kind === (direction === "in" ? "income" : "expense"));

  if (state?.ok && compact) return <p className="text-sm text-primary">{state.message}</p>;

  return (
    <form action={action} className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <label>
        Quando a descrição
        <select name="operator" defaultValue="contains" className="input mt-1">
          <option value="contains">contém</option>
          <option value="starts_with">começa com</option>
          <option value="equals">é igual a</option>
          <option value="regex">casa com a regex</option>
        </select>
      </label>
      <label className="sm:col-span-1 lg:col-span-2">
        Texto
        <input name="pattern" required defaultValue={defaults?.pattern} className="input mt-1" placeholder="Ex.: UBER, IFOOD, NETFLIX" />
      </label>
      <label>
        Sentido
        <select name="direction" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} className="input mt-1">
          <option value="any">Entradas e saídas</option>
          <option value="out">Só saídas</option>
          <option value="in">Só entradas</option>
        </select>
      </label>
      {!compact && (
        <>
          <label>
            Valor mínimo (R$)
            <input name="amountMin" inputMode="decimal" className="input mt-1" placeholder="opcional" />
          </label>
          <label>
            Valor máximo (R$)
            <input name="amountMax" inputMode="decimal" className="input mt-1" placeholder="opcional" />
          </label>
          <label>
            Só na conta
            <select name="accountId" defaultValue="" className="input mt-1">
              <option value="">Qualquer conta</option>
              {options.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prioridade
            <input name="priority" type="number" min={0} max={1000} defaultValue={100} className="input mt-1" title="Menor número vence" />
          </label>
        </>
      )}
      <label className="sm:col-span-1 lg:col-span-2">
        Definir categoria
        <select key={direction} name="categoryId" defaultValue={defaults?.categoryId ?? ""} className="input mt-1">
          <option value="">Não alterar</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-1 lg:col-span-2">
        Definir contato
        <select name="contactId" defaultValue={defaults?.contactId ?? ""} className="input mt-1">
          <option value="">Não alterar</option>
          {options.contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {!compact && (
        <label className="sm:col-span-2 lg:col-span-4">
          Nome da regra (opcional)
          <input name="name" className="input mt-1" />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="applyNow" defaultChecked /> Aplicar agora aos lançamentos sem categoria
        </label>
        <button className="btn" disabled={pending}>
          {pending ? "Salvando..." : "Criar regra"}
        </button>
        {state && <p className={state.ok ? "text-primary" : "text-danger"}>{state.message}</p>}
      </div>
    </form>
  );
}
