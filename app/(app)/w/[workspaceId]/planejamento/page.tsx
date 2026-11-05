import Link from "next/link";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { loadPlan } from "@/lib/planning-server";
import { loadOptions } from "@/lib/transactions";
import { formatBRL } from "@/lib/finance/money";
import { formatDateBR, todayISO } from "@/lib/finance/dates";
import { firstNegativeMonth, monthlyPlan, reservePlan } from "@/lib/finance/planning";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { FutureBillForm, Simulator } from "./forms";
import { setReserve } from "./actions";

const MONTHS = 12;
const TABS = [
  { key: "calendario", label: "Calendário" },
  { key: "simulador", label: "Simulador “e se”" },
  { key: "reservas", label: "Reserva mensal" },
] as const;

const monthLong = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const t = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 1)));
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export default async function PlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { workspaceId } = await params;
  const { aba } = await searchParams;
  const tab = TABS.find((t) => t.key === aba)?.key ?? "calendario";
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");
  const today = todayISO();
  const [data, options] = await Promise.all([loadPlan(supabase, workspaceId, today, MONTHS), loadOptions(supabase, workspaceId)]);
  const plan = monthlyPlan(data.start, today, MONTHS, data.items);
  const neg = firstNegativeMonth(plan);
  const lowest = plan.reduce((m, x) => (x.lowest < m.lowest ? x : m), plan[0]);
  const futureOut = plan.reduce((s, m) => s + m.expense, 0);
  const futureIn = plan.reduce((s, m) => s + m.income, 0);
  const reserves = reservePlan(data.reserves, today);
  const base = `/w/${workspaceId}/planejamento`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-muted">{current.name}</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Planejamento</h1>
        <p className="text-sm text-muted">Tudo o que vai entrar e sair nos próximos 12 meses: contas fixas, parcelas, faturas e contas avulsas.</p>
      </div>

      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted">Saldo hoje</p>
          <p className={`text-xl font-extrabold tabular-nums ${data.start < 0 ? "text-danger" : ""}`}>{formatBRL(data.start)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted">Previsto em 12 meses</p>
          <p className={`text-xl font-extrabold tabular-nums ${plan[MONTHS - 1].endBalance < 0 ? "text-danger" : "text-primary"}`}>{formatBRL(plan[MONTHS - 1].endBalance)}</p>
          <p className="text-xs text-muted">
            entram {formatBRL(futureIn)} · saem {formatBRL(futureOut)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted">Menor saldo previsto</p>
          <p className={`text-xl font-extrabold tabular-nums ${lowest.lowest < 0 ? "text-danger" : ""}`}>{formatBRL(lowest.lowest)}</p>
          <p className="text-xs text-muted">{monthLong(lowest.month)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted">Reservar por mês</p>
          <p className="text-xl font-extrabold tabular-nums">{formatBRL(reserves.totalPerMonth)}</p>
          <p className="text-xs text-muted">{reserves.rows.length} conta(s) com reserva</p>
        </div>
      </div>

      {neg && (
        <div role="alert" className="flex items-start gap-3 rounded-[14px] border border-danger/40 bg-danger-soft p-4 text-sm">
          <Icon name="alert" size={18} className="mt-0.5 text-danger" />
          <p>
            Pelo que está previsto, o saldo fica negativo em <b>{monthLong(neg)}</b>. Antecipe uma entrada, adie uma conta ou parcele
            de outro jeito — use o simulador para testar.
          </p>
        </div>
      )}

      {canEdit && (
        <details className="card group" open={data.items.length === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
            Adicionar conta futura
            <span aria-hidden="true" className="text-muted transition group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="mt-4">
            <FutureBillForm workspaceId={workspaceId} accounts={data.accounts} categories={options.categories} today={today} />
            <p className="mt-3 text-xs text-muted">
              Contas que se repetem todo mês (aluguel, salário) ficam melhor em{" "}
              <Link href={`/w/${workspaceId}/recorrencias`} className="underline">
                Recorrências
              </Link>
              .
            </p>
          </div>
        </details>
      )}

      <nav aria-label="Visões do planejamento" className="flex gap-1 rounded-[10px] bg-surface-2 p-[3px] text-sm font-medium">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}?aba=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`flex-1 rounded-lg px-3 py-1.5 text-center ${tab === t.key ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(17,22,20,0.08)]" : "text-muted hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "calendario" &&
        (data.items.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="repeat"
              title="Nada previsto ainda"
              hint="Cadastre contas fixas em Recorrências, compras parceladas em Lançamentos e contas avulsas aqui em cima."
              action={{ href: `/w/${workspaceId}/recorrencias`, label: "Cadastrar contas fixas" }}
            />
          </div>
        ) : (
          <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plan.map((m) => {
              const max = Math.max(1, m.income, m.expense);
              return (
                <details key={m.month} className="card group lift space-y-3 p-0" open={m.month === plan[0].month}>
                  <summary className="cursor-pointer list-none space-y-3 p-5">
                    <div className="flex items-center justify-between">
                      <h2 className="font-semibold">{monthLong(m.month)}</h2>
                      <span className="text-xs text-muted">{m.items.length} item(ns)</span>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-14 text-muted">Entra</span>
                        <span className="h-2 flex-1 rounded-full bg-surface-2">
                          <span className="bar-grow block h-2 rounded-full" style={{ width: `${(m.income / max) * 100}%`, background: "var(--series-income)" }} />
                        </span>
                        <span className="w-28 text-right tabular-nums">{formatBRL(m.income)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-14 text-muted">Sai</span>
                        <span className="h-2 flex-1 rounded-full bg-surface-2">
                          <span className="bar-grow block h-2 rounded-full" style={{ width: `${(m.expense / max) * 100}%`, background: "var(--series-expense)" }} />
                        </span>
                        <span className="w-28 text-right tabular-nums">{formatBRL(m.expense)}</span>
                      </div>
                    </div>
                    <div className="flex items-end justify-between border-t border-border pt-3">
                      <span className="text-xs text-muted">Saldo ao fim do mês</span>
                      <span className={`text-lg font-extrabold tabular-nums ${m.endBalance < 0 ? "text-danger" : ""}`}>{formatBRL(m.endBalance)}</span>
                    </div>
                    {m.lowest < 0 && m.lowest < m.endBalance && (
                      <p className="text-xs text-danger">Fica negativo durante o mês (mínimo {formatBRL(m.lowest)}).</p>
                    )}
                    <span className="block text-xs text-primary group-open:hidden">Ver contas do mês</span>
                  </summary>
                  {m.items.length > 0 && (
                    <ul className="divide-y divide-border border-t border-border text-sm">
                      {m.items.map((it) => (
                        <li key={it.id + it.date} className="flex items-center gap-3 px-5 py-2">
                          <span className="w-12 text-xs text-muted tabular-nums">{formatDateBR(it.date).slice(0, 5)}</span>
                          <span className="min-w-0 flex-1 truncate">
                            {it.description}
                            {it.installment && <span className="ml-1 text-xs text-muted">({it.installment})</span>}
                            {it.recurring && <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">fixa</span>}
                            {it.kind === "fatura" && <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">cartão</span>}
                          </span>
                          <span className={`tabular-nums ${it.cents < 0 ? "" : "text-primary"}`}>{formatBRL(it.cents)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              );
            })}
          </div>
        ))}

      {tab === "simulador" && (
        <section className="card space-y-2">
          <h2 className="font-bold">E se eu comprar isto?</h2>
          <p className="text-sm text-muted">Veja o efeito de uma compra (à vista ou parcelada) ou de uma entrada extra no saldo dos próximos meses.</p>
          <Simulator start={data.start} items={data.items} today={today} months={MONTHS} />
        </section>
      )}

      {tab === "reservas" && (
        <section className="card space-y-4">
          <div>
            <h2 className="font-bold">Reserva mensal</h2>
            <p className="text-sm text-muted">
              Para contas grandes que vêm de uma vez (IPVA, IPTU, matrícula, seguro), separe um pouco por mês até o vencimento. Marque “Reservar um valor
              todo mês” ao adicionar a conta futura.
            </p>
          </div>
          {reserves.rows.length === 0 ? (
            <EmptyState icon="target" title="Nenhuma conta com reserva" hint="Adicione uma conta futura e marque “Reservar um valor todo mês até o vencimento”." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 font-semibold">Conta</th>
                      <th className="py-2 font-semibold">Vence</th>
                      <th className="py-2 text-right font-semibold">Valor</th>
                      <th className="py-2 text-right font-semibold">Meses</th>
                      <th className="py-2 text-right font-semibold">Separar por mês</th>
                      {canEdit && <th className="py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {reserves.rows.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="py-2.5">{r.description}</td>
                        <td className={`py-2.5 tabular-nums ${r.late ? "text-danger" : ""}`}>
                          {formatDateBR(r.dueDate)}
                          {r.late && " (vencida)"}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{formatBRL(r.cents)}</td>
                        <td className="py-2.5 text-right tabular-nums">{r.months}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums">{formatBRL(r.perMonth)}</td>
                        {canEdit && (
                          <td className="py-2.5 text-right">
                            <form action={setReserve}>
                              <input type="hidden" name="workspaceId" value={workspaceId} />
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="on" value="false" />
                              <button className="text-xs text-muted hover:underline">Tirar da reserva</button>
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-bold">
                      <td className="py-2.5" colSpan={4}>
                        Total a separar por mês
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{formatBRL(reserves.totalPerMonth)}</td>
                      {canEdit && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-muted">
                Dica: crie uma meta em{" "}
                <Link href={`/w/${workspaceId}/metas`} className="underline">
                  Metas
                </Link>{" "}
                para registrar o que já guardou.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
