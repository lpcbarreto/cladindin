"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createFutureBill } from "./actions";
import { firstNegativeMonth, monthlyPlan, simulationItems, type PlanItem } from "@/lib/finance/planning";
import { parseMoneyToCents } from "@/lib/finance/money";

type Opt = { id: string; name: string };
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (c: number) => brl.format(c / 100);
const monthName = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const short = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 1))).replace(".", "");
  return `${short}/${String(y).slice(2)}`;
};

/** Cadastro de conta futura (avulsa ou parcelada), com opção de reserva mensal. */
export function FutureBillForm({ workspaceId, accounts, categories, today }: { workspaceId: string; accounts: Opt[]; categories: (Opt & { kind: string })[]; today: string }) {
  const [state, action, pending] = useActionState(createFutureBill, null);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [parcelas, setParcelas] = useState(1);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      setParcelas(1);
    }
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <fieldset className="flex gap-1 rounded-[10px] bg-surface-2 p-[3px] text-sm lg:col-span-2">
        <legend className="sr-only">Tipo</legend>
        {(["expense", "income"] as const).map((k) => (
          <label key={k} className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-center font-medium ${kind === k ? "bg-surface shadow-[0_1px_2px_rgba(17,22,20,0.08)]" : "text-muted"}`}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {k === "expense" ? "Conta a pagar" : "Conta a receber"}
          </label>
        ))}
      </fieldset>
      <label className="text-sm lg:col-span-4">
        <span className="text-muted">Descrição</span>
        <input name="description" required maxLength={300} placeholder="IPVA 2027, matrícula escolar, viagem…" className="input mt-1" />
      </label>
      <label className="text-sm">
        <span className="text-muted">Valor total</span>
        <input name="amount" required inputMode="decimal" placeholder="1.800,00" className="input mt-1" />
      </label>
      <label className="text-sm">
        <span className="text-muted">{parcelas > 1 ? "1º vencimento" : "Vencimento"}</span>
        <input name="dueDate" type="date" required min={today} className="input mt-1" />
      </label>
      <label className="text-sm">
        <span className="text-muted">Parcelas</span>
        <input name="installments" type="number" min={1} max={120} value={parcelas} onChange={(e) => setParcelas(Math.max(1, Number(e.target.value) || 1))} className="input mt-1" />
      </label>
      <label className="text-sm">
        <span className="text-muted">Conta</span>
        <select name="accountId" required className="input mt-1">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm lg:col-span-2">
        <span className="text-muted">Categoria (opcional)</span>
        <select name="categoryId" className="input mt-1" defaultValue="">
          <option value="">Sem categoria</option>
          {categories
            .filter((c) => c.kind === kind)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      {kind === "expense" && parcelas === 1 && (
        <label className="flex items-center gap-2 text-sm lg:col-span-4">
          <input type="checkbox" name="reserve" className="h-4 w-4 accent-[var(--primary)]" />
          Reservar um valor todo mês até o vencimento
        </label>
      )}
      <div className="flex items-center gap-3 lg:col-span-2 lg:justify-end">
        {state && (
          <span role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-primary" : "text-danger"}`}>
            {state.message}
          </span>
        )}
        <button className="btn" disabled={pending || accounts.length === 0}>
          {pending ? "Salvando..." : "Adicionar conta futura"}
        </button>
      </div>
    </form>
  );
}

/** "E se eu comprar isto?" — calcula na hora, sem gravar nada. */
export function Simulator({ start, items, today, months }: { start: number; items: PlanItem[]; today: string; months: number }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState(1);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [firstDate, setFirstDate] = useState(today);

  const cents = useMemo(() => {
    try {
      return amount.trim() ? Math.abs(parseMoneyToCents(amount)) : 0;
    } catch {
      return 0;
    }
  }, [amount]);

  const base = useMemo(() => monthlyPlan(start, today, months, items), [start, today, months, items]);
  const sim = useMemo(
    () => monthlyPlan(start, today, months, [...items, ...simulationItems({ description, totalCents: cents, kind, installments, firstDate: firstDate || today })]),
    [start, today, months, items, description, cents, kind, installments, firstDate],
  );
  const negBase = firstNegativeMonth(base);
  const negSim = firstNegativeMonth(sim);
  const lowest = sim.reduce((m, x) => (x.lowest < m.lowest ? x : m), sim[0]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <label className="text-sm lg:col-span-2">
          <span className="text-muted">O que você quer simular?</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notebook novo, reforma, viagem…" className="input mt-1" />
        </label>
        <label className="text-sm">
          <span className="text-muted">Valor total</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="4.500,00" className="input mt-1" />
        </label>
        <label className="text-sm">
          <span className="text-muted">Parcelas</span>
          <input type="number" min={1} max={120} value={installments} onChange={(e) => setInstallments(Math.min(120, Math.max(1, Number(e.target.value) || 1)))} className="input mt-1" />
        </label>
        <label className="text-sm">
          <span className="text-muted">{installments > 1 ? "1ª parcela em" : "Data"}</span>
          <input type="date" value={firstDate} min={today} onChange={(e) => setFirstDate(e.target.value)} className="input mt-1" />
        </label>
        <fieldset className="flex gap-1 rounded-[10px] bg-surface-2 p-[3px] text-sm sm:col-span-2 lg:col-span-2">
          <legend className="sr-only">Tipo</legend>
          {(["expense", "income"] as const).map((k) => (
            <label key={k} className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-center font-medium ${kind === k ? "bg-surface shadow-[0_1px_2px_rgba(17,22,20,0.08)]" : "text-muted"}`}>
              <input type="radio" checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "expense" ? "Gasto" : "Entrada extra"}
            </label>
          ))}
        </fieldset>
      </div>

      {cents > 0 && (
        <div role="status" className={`rounded-[14px] border p-4 text-sm ${negSim && !negBase ? "border-danger/40 bg-danger-soft" : negSim ? "border-border bg-surface-2" : "border-border bg-primary-soft"}`}>
          {negSim && !negBase ? (
            <p>
              <b className="text-danger">Não cabe:</b> com isso, o saldo fica negativo em <b>{monthName(negSim)}</b> (menor saldo {money(lowest.lowest)}). Tente mais
              parcelas ou outra data.
            </p>
          ) : negSim ? (
            <p>
              O saldo já ficaria negativo em <b>{monthName(negBase!)}</b> mesmo sem esta compra. Com ela, o menor saldo vai a <b>{money(lowest.lowest)}</b>.
            </p>
          ) : (
            <p>
              <b className="text-primary">Cabe no planejamento.</b> O menor saldo previsto fica em <b>{money(lowest.lowest)}</b> ({monthName(lowest.month)}).
            </p>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-[14px] border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Saldo previsto ao fim de cada mês, sem e com a simulação</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="sticky left-0 bg-surface p-3 text-left font-semibold">Mês</th>
              <th className="p-3 text-right font-semibold">Saldo previsto hoje</th>
              <th className="p-3 text-right font-semibold">Com a simulação</th>
              <th className="p-3 text-right font-semibold">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {sim.map((m, i) => {
              const diff = m.endBalance - base[i].endBalance;
              return (
                <tr key={m.month} className="border-b border-border last:border-0">
                  <td className="sticky left-0 bg-surface p-3 font-semibold">{monthName(m.month)}</td>
                  <td className={`p-3 text-right tabular-nums ${base[i].endBalance < 0 ? "text-danger" : ""}`}>{money(base[i].endBalance)}</td>
                  <td className={`p-3 text-right font-semibold tabular-nums ${m.endBalance < 0 ? "text-danger" : ""}`}>{money(m.endBalance)}</td>
                  <td className={`p-3 text-right tabular-nums ${diff < 0 ? "text-danger" : diff > 0 ? "text-primary" : "text-muted"}`}>{diff ? money(diff) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">A simulação não grava nada. Se decidir fazer, cadastre em “Adicionar conta futura”.</p>
    </div>
  );
}
