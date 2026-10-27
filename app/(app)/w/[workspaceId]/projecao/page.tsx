import Link from "next/link";
import { loadWorkspaceContext } from "@/lib/workspace";
import { loadProjection } from "@/lib/projection-server";
import { formatBRL } from "@/lib/finance/money";
import { formatDateBR, todayISO } from "@/lib/finance/dates";
import { BalanceChart } from "@/components/charts";

const RANGES = [30, 90, 180] as const;

export default async function ProjectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ dias?: string }>;
}) {
  const { workspaceId } = await params;
  const { dias } = await searchParams;
  const days = RANGES.find((r) => String(r) === dias) ?? 90;
  const { supabase } = await loadWorkspaceContext(workspaceId);
  const today = todayISO();
  const p = await loadProjection(supabase, workspaceId, today, days);
  const base = `/w/${workspaceId}/projecao`;
  const upcoming = p.events
    .map((e) => ({ ...e, date: e.date < today ? today : e.date }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 40);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Projeção de saldo</h1>
          <p className="text-sm text-muted">Saldo das contas somado às contas previstas, recorrências e faturas de cartão.</p>
        </div>
        <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-sm font-semibold">
          {RANGES.map((r) => (
            <Link key={r} href={`${base}?dias=${r}`} className={`rounded-full px-4 py-1.5 ${days === r ? "bg-surface shadow-sm" : "text-muted hover:text-foreground"}`}>
              {r} dias
            </Link>
          ))}
        </div>
      </div>

      {p.firstNegative ? (
        <div role="alert" className="card border-danger/40 bg-danger-soft text-sm">
          <b className="text-danger">Atenção:</b> o saldo fica negativo em <b>{formatDateBR(p.firstNegative)}</b>. O ponto mais baixo é{" "}
          <b className="text-danger tabular-nums">{formatBRL(p.lowest.balance)}</b> em {formatDateBR(p.lowest.date)}.
        </div>
      ) : (
        <div className="card bg-primary-soft text-sm">
          Tudo certo: o saldo não fica negativo nos próximos {days} dias.
        </div>
      )}

      <div className="stagger grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm font-semibold text-muted">Saldo hoje</p>
          <p className="text-2xl font-extrabold tabular-nums">{formatBRL(p.start)}</p>
        </div>
        <div className="card">
          <p className="text-sm font-semibold text-muted">Ponto mais baixo</p>
          <p className={`text-2xl font-extrabold tabular-nums ${p.lowest.balance < 0 ? "text-danger" : ""}`}>{formatBRL(p.lowest.balance)}</p>
          <p className="text-xs text-muted">{formatDateBR(p.lowest.date)}</p>
        </div>
        <div className="card">
          <p className="text-sm font-semibold text-muted">Em {days} dias</p>
          <p className={`text-2xl font-extrabold tabular-nums ${p.end < 0 ? "text-danger" : "text-primary"}`}>{formatBRL(p.end)}</p>
        </div>
      </div>

      <section className="card">
        <BalanceChart data={p.points} zeroLine />
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">Próximas movimentações</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">Nada previsto no período. Cadastre recorrências ou contas a pagar para a projeção ficar mais útil.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {upcoming.map((e, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span className="truncate">
                  <span className="w-20 text-muted tabular-nums">{formatDateBR(e.date)}</span> {e.description}
                </span>
                <span className={`tabular-nums ${e.cents < 0 ? "text-danger" : "text-primary"}`}>{formatBRL(e.cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
