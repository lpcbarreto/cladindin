"use client";

import { useActionState, useState } from "react";
import type { CategoryOption, Option } from "@/lib/transactions";
import { FREQUENCY_LABEL } from "@/lib/finance/recurrence";
import { createRule, updateRule } from "./actions";

export type RuleDefaults = {
  id?: string;
  type: "income" | "expense" | "transfer";
  accountId: string;
  toAccountId: string;
  description: string;
  amount: string;
  variable: boolean;
  categoryId: string;
  contactId: string;
  frequency: keyof typeof FREQUENCY_LABEL;
  interval: number;
  dayMode: "fixed" | "last" | "business";
  day: number;
  startDate: string;
  endMode: "never" | "until" | "count";
  untilDate: string;
  count: string;
  adjust: "none" | "before" | "after";
};

export function RuleForm({
  workspaceId,
  options,
  defaults,
  today,
}: {
  workspaceId: string;
  options: { accounts: Option[]; categories: CategoryOption[]; contacts: Option[] };
  defaults: RuleDefaults;
  today: string;
}) {
  const editing = Boolean(defaults.id);
  const [state, action, pending] = useActionState(editing ? updateRule : createRule, null);
  const [type, setType] = useState(defaults.type);
  const [frequency, setFrequency] = useState(defaults.frequency);
  const [dayMode, setDayMode] = useState(defaults.dayMode);
  const [endMode, setEndMode] = useState(defaults.endMode);
  const [scope, setScope] = useState<"all" | "from">("all");
  const monthly = !["daily", "weekly", "biweekly"].includes(frequency);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      <fieldset className="flex gap-1 rounded-full bg-surface-2 p-1 text-sm font-semibold sm:col-span-2 lg:col-span-4">
        <legend className="sr-only">Tipo</legend>
        {(["expense", "income", "transfer"] as const).map((t) => (
          <label key={t} className={`flex-1 cursor-pointer rounded-full px-2 py-1.5 text-center transition ${type === t ? "bg-surface shadow-sm" : "text-muted"}`}>
            <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
            {t === "expense" ? "Despesa" : t === "income" ? "Receita" : "Transferência"}
          </label>
        ))}
      </fieldset>

      <label className="text-sm sm:col-span-2">
        Descrição
        <input name="description" required defaultValue={defaults.description} className="input mt-1" placeholder="Ex.: Aluguel, Netflix, Salário" />
      </label>
      <label className="text-sm">
        Valor (R$)
        <input name="amount" required inputMode="decimal" defaultValue={defaults.amount} className="input mt-1" />
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="variable" defaultChecked={defaults.variable} /> Valor variável (estimado)
      </label>

      <label className="text-sm">
        {type === "transfer" ? "De" : "Conta"}
        <select key={`acc-${type}`} name="accountId" defaultValue={defaults.accountId} className="input mt-1">
          {options.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {type === "transfer" ? (
        <label className="text-sm">
          Para
          <select key="to" name="toAccountId" defaultValue={defaults.toAccountId || options.accounts[1]?.id} className="input mt-1">
            {options.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label className="text-sm">
            Categoria
            <select key={`cat-${type}`} name="categoryId" defaultValue={defaults.categoryId} className="input mt-1">
              <option value="">Sem categoria</option>
              {options.categories
                .filter((c) => c.kind === type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm">
            {type === "income" ? "Cliente" : "Fornecedor"}
            <select name="contactId" defaultValue={defaults.contactId} className="input mt-1">
              <option value="">Nenhum</option>
              {options.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <div className="hidden lg:block" />

      <label className="text-sm">
        Frequência
        <select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as RuleDefaults["frequency"])} className="input mt-1">
          {Object.entries(FREQUENCY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        A cada
        <input name="interval" type="number" min={1} max={36} defaultValue={defaults.interval} className="input mt-1" />
      </label>
      {monthly ? (
        <>
          <label className="text-sm">
            Vencimento
            <select name="dayMode" value={dayMode} onChange={(e) => setDayMode(e.target.value as RuleDefaults["dayMode"])} className="input mt-1">
              <option value="fixed">Dia do mês</option>
              <option value="last">Último dia do mês</option>
              <option value="business">N-ésimo dia útil</option>
            </select>
          </label>
          <label className={`text-sm ${dayMode === "last" ? "opacity-40" : ""}`}>
            {dayMode === "business" ? "Dia útil nº" : "Dia"}
            <input name="day" type="number" min={1} max={dayMode === "business" ? 23 : 31} defaultValue={defaults.day} className="input mt-1" />
          </label>
        </>
      ) : (
        <>
          <input type="hidden" name="dayMode" value="fixed" />
          <input type="hidden" name="day" value="1" />
          <p className="self-end pb-2 text-xs text-muted sm:col-span-2">Conta a partir da data de início.</p>
        </>
      )}

      <label className="text-sm">
        Início
        <input name="startDate" type="date" required defaultValue={defaults.startDate} className="input mt-1" />
      </label>
      <label className="text-sm">
        Término
        <select name="endMode" value={endMode} onChange={(e) => setEndMode(e.target.value as RuleDefaults["endMode"])} className="input mt-1">
          <option value="never">Nunca</option>
          <option value="until">Até uma data</option>
          <option value="count">Após N ocorrências</option>
        </select>
      </label>
      {endMode === "until" && (
        <label className="text-sm">
          Até
          <input name="untilDate" type="date" defaultValue={defaults.untilDate} className="input mt-1" />
        </label>
      )}
      {endMode === "count" && (
        <label className="text-sm">
          Ocorrências
          <input name="count" type="number" min={1} max={1000} defaultValue={defaults.count} className="input mt-1" />
        </label>
      )}
      <label className="text-sm">
        Fim de semana/feriado
        <select name="adjust" defaultValue={defaults.adjust} className="input mt-1">
          <option value="none">Manter a data</option>
          <option value="before">Antecipar p/ dia útil</option>
          <option value="after">Postergar p/ dia útil</option>
        </select>
      </label>

      {editing && (
        <fieldset className="space-y-2 rounded-2xl bg-surface-2 p-3 text-sm sm:col-span-2 lg:col-span-4">
          <legend className="sr-only">Aplicar alterações</legend>
          <p className="font-semibold">Aplicar alterações a</p>
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" value="all" checked={scope === "all"} onChange={() => setScope("all")} />
            Todas as ocorrências futuras (de hoje em diante)
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" name="scope" value="from" checked={scope === "from"} onChange={() => setScope("from")} />
            Esta e as próximas, a partir de
            <input name="fromDate" type="date" defaultValue={today} disabled={scope !== "from"} className="input w-44 py-1" />
          </label>
          <p className="text-xs text-muted">
            Para mudar só uma ocorrência, edite o lançamento em Lançamentos ou A pagar/receber. Lançamentos já pagos nunca são alterados.
          </p>
        </fieldset>
      )}

      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <button className="btn" disabled={pending}>
          {editing ? "Salvar alterações" : "Criar recorrência"}
        </button>
        {state && <p className={`text-sm ${state.ok ? "text-primary" : "text-danger"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
