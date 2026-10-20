import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { formatDateBR, todayISO } from "@/lib/finance/dates";
import { goalPlan } from "@/lib/finance/goals";
import { ConfirmButton } from "@/components/confirm-button";
import { goalOp } from "./actions";
import { ContributionForm, GoalForm } from "./forms";

type Goal = {
  id: string;
  name: string;
  emoji: string | null;
  target_cents: number;
  target_date: string | null;
  archived: boolean;
  saved_cents: number;
};

export default async function GoalsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");
  const today = todayISO();
  const { data, error } = await supabase
    .from("goal_progress")
    .select("id, name, emoji, target_cents, target_date, archived, saved_cents")
    .eq("workspace_id", workspaceId)
    .order("archived")
    .order("created_at");
  const goals = (data ?? []) as Goal[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Metas de economia</h1>
        <p className="text-sm text-muted">Defina um objetivo, registre o quanto guardou e veja quanto falta por mês.</p>
      </div>

      {error && (
        <div role="alert" className="card bg-danger-soft text-sm text-danger">
          Não foi possível carregar as metas. Verifique se a migration 20261020000009 foi aplicada no Supabase.
        </div>
      )}

      {canEdit && (
        <section className="card space-y-3">
          <h2 className="font-bold">Nova meta</h2>
          <GoalForm workspaceId={workspaceId} />
        </section>
      )}

      {goals.length === 0 && !error ? (
        <div className="card space-y-2 py-10 text-center">
          <p className="text-4xl" aria-hidden="true">
            🎯
          </p>
          <p className="font-bold">Nenhuma meta ainda</p>
          <p className="text-sm text-muted">Que tal começar com uma reserva de emergência de 6 meses de gastos?</p>
        </div>
      ) : (
        <div className="stagger grid gap-4 md:grid-cols-2">
          {goals.map((g) => {
            const plan = goalPlan(Number(g.saved_cents), Number(g.target_cents), g.target_date, today);
            return (
              <section key={g.id} className={`card space-y-3 ${g.archived ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-extrabold">
                      {g.emoji && <span className="mr-1">{g.emoji}</span>}
                      {g.name}
                    </h2>
                    <p className="text-sm text-muted">
                      {formatBRL(Number(g.saved_cents))} de {formatBRL(Number(g.target_cents))}
                      {g.target_date && <> · até {formatDateBR(g.target_date)}</>}
                    </p>
                  </div>
                  <span className={`text-2xl font-extrabold tabular-nums ${plan.done ? "text-primary" : ""}`}>{plan.percent}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={plan.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${g.name}`}>
                  <div className="bar-grow h-3 rounded-full bg-primary" style={{ width: `${plan.percent}%` }} />
                </div>
                <p className="text-sm">
                  {plan.done ? (
                    <b className="text-primary">Meta alcançada! 🎉</b>
                  ) : plan.late ? (
                    <span className="text-danger">
                      Prazo passou — faltam <b>{formatBRL(plan.remaining)}</b>.
                    </span>
                  ) : plan.perMonth ? (
                    <>
                      Guarde <b className="tabular-nums">{formatBRL(plan.perMonth)}</b> por mês para chegar lá. Faltam {formatBRL(plan.remaining)}.
                    </>
                  ) : (
                    <>Faltam {formatBRL(plan.remaining)}.</>
                  )}
                </p>
                {canEdit && (
                  <div className="space-y-2 border-t border-border pt-3">
                    {!g.archived && <ContributionForm workspaceId={workspaceId} goalId={g.id} today={today} />}
                    <div className="flex gap-3 text-xs">
                      <form action={goalOp}>
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="op" value={g.archived ? "unarchive" : "archive"} />
                        <button className="text-muted hover:underline">{g.archived ? "Reativar" : "Arquivar"}</button>
                      </form>
                      <form action={goalOp}>
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="op" value="delete" />
                        <ConfirmButton message={`Excluir a meta “${g.name}” e todo o histórico?`} className="text-danger hover:underline">
                          Excluir
                        </ConfirmButton>
                      </form>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
