import Link from "next/link";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { formatMonthBR, shiftMonth, todayISO } from "@/lib/finance/dates";
import { budgetStatus } from "@/lib/finance/budget";
import { loadBudget } from "@/lib/budget-server";
import { BudgetForm } from "./budget-form";

const STATUS = {
  ok: { label: "No limite", bar: "bg-primary", text: "text-primary" },
  attention: { label: "Atenção", bar: "bg-accent", text: "text-foreground" },
  over: { label: "Estourado", bar: "bg-danger", text: "text-danger" },
  none: { label: "Sem limite", bar: "bg-muted/40", text: "text-muted" },
} as const;

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { workspaceId } = await params;
  const { mes } = await searchParams;
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : todayISO().slice(0, 7);
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");
  const rows = await loadBudget(supabase, workspaceId, month);
  const withBudget = rows.filter((r) => r.budget);
  const totalBudget = withBudget.reduce((a, r) => a + (r.budget ?? 0), 0);
  const totalUsed = withBudget.reduce((a, r) => a + r.spent + r.planned, 0);
  const base = `/w/${workspaceId}/orcamento`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Orçamento</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link className="btn-ghost px-3" href={`${base}?mes=${shiftMonth(month, -1)}`} aria-label="Mês anterior">
            ‹
          </Link>
          <span className="min-w-36 text-center font-semibold">{formatMonthBR(month)}</span>
          <Link className="btn-ghost px-3" href={`${base}?mes=${shiftMonth(month, 1)}`} aria-label="Próximo mês">
            ›
          </Link>
        </div>
      </div>

      {withBudget.length > 0 && (
        <div className="card flex flex-wrap items-center gap-6">
          <div>
            <p className="text-sm font-semibold text-muted">Orçado no mês</p>
            <p className="text-2xl font-extrabold tabular-nums">{formatBRL(totalBudget)}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-muted">Gasto + previsto</p>
            <p className={`text-2xl font-extrabold tabular-nums ${totalUsed > totalBudget ? "text-danger" : ""}`}>{formatBRL(totalUsed)}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-muted">{totalUsed > totalBudget ? "Acima do orçado" : "Ainda disponível"}</p>
            <p className="text-2xl font-extrabold tabular-nums">{formatBRL(Math.abs(totalBudget - totalUsed))}</p>
          </div>
        </div>
      )}

      <div className="card stagger divide-y divide-border p-0">
        {rows.map((r) => {
          const st = STATUS[budgetStatus(r)];
          const used = r.spent + r.planned;
          const pct = r.budget ? Math.min(100, (used / r.budget) * 100) : 0;
          const spentPct = r.budget ? Math.min(100, (r.spent / r.budget) * 100) : 0;
          return (
            <div key={r.categoryId} className="space-y-2 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">{r.name}</p>
                  <p className="text-xs text-muted">
                    Gasto {formatBRL(r.spent)}
                    {r.planned > 0 && <> + previsto {formatBRL(r.planned)}</>}
                    {r.budget && (
                      <>
                        {" "}
                        de {formatBRL(r.budget)} ·{" "}
                        <span className={`font-semibold ${st.text}`}>
                          {st.label} ({Math.round((used / r.budget) * 100)}%)
                        </span>
                      </>
                    )}
                  </p>
                </div>
                {canEdit && <BudgetForm key={`${r.categoryId}-${month}`} workspaceId={workspaceId} categoryId={r.categoryId} month={month} amount={r.budget} isDefault={r.isDefault} />}
              </div>
              {r.budget && (
                <div className="relative h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${Math.round((used / r.budget) * 100)}% do orçamento usado`}>
                  {/* Previsto em tom claro, realizado sólido */}
                  <div className={`bar-grow absolute inset-y-0 left-0 rounded-full opacity-40 ${st.bar}`} style={{ width: `${pct}%` }} />
                  <div className={`bar-grow absolute inset-y-0 left-0 rounded-full ${st.bar}`} style={{ width: `${spentPct}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">Pela data de competência (data da compra). Subcategorias somam na categoria principal. A barra clara é o que ainda está previsto.</p>
    </div>
  );
}
