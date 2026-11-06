import Link from "next/link";
import { hasRole, loadWorkspaceContext } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { formatMonthBR, monthRange, shiftMonth, todayISO } from "@/lib/finance/dates";
import { ConfirmButton } from "@/components/confirm-button";
import { CostCenterForm } from "./form";
import { deleteCostCenter } from "./actions";

export const metadata = { title: "Centros de custo" };

export default async function CostCentersPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { workspaceId } = await params;
  const { mes } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(mes ?? "") ? mes! : todayISO().slice(0, 7);
  const { start, end } = monthRange(month);
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");

  const [{ data: centers }, { data: txs }] = await Promise.all([
    supabase.from("cost_centers").select("id, name").eq("workspace_id", workspaceId).order("name"),
    supabase
      .from("transactions")
      .select("cost_center_id, type, direction, amount_cents")
      .eq("workspace_id", workspaceId)
      .not("cost_center_id", "is", null)
      .neq("status", "cancelled")
      .neq("type", "transfer")
      .is("deleted_at", null)
      .gte("competence_date", start)
      .lte("competence_date", end),
  ]);
  const totals = new Map<string, { inc: number; exp: number }>();
  for (const t of txs ?? []) {
    const cur = totals.get(t.cost_center_id!) ?? { inc: 0, exp: 0 };
    const signed = t.amount_cents * t.direction;
    if (signed >= 0) cur.inc += signed;
    else cur.exp += -signed;
    totals.set(t.cost_center_id!, cur);
  }
  const maxExp = Math.max(1, ...[...totals.values()].map((v) => Math.max(v.inc, v.exp)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Centros de custo</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Separe receitas e despesas por obra, cliente, filial ou projeto. Escolha o centro ao criar ou editar um lançamento.
        </p>
      </div>

      {canEdit && (
        <div className="card">
          <CostCenterForm workspaceId={workspaceId} />
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Resultado por centro · {formatMonthBR(month)}</h2>
          <div className="flex gap-2 text-sm">
            <Link className="btn-ghost" href={`?mes=${shiftMonth(month, -1)}`}>
              ← Mês anterior
            </Link>
            <Link className="btn-ghost" href={`?mes=${shiftMonth(month, 1)}`}>
              Próximo mês →
            </Link>
          </div>
        </div>
        {(centers ?? []).length === 0 ? (
          <p className="text-sm text-muted">Nenhum centro de custo ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="p-2 font-normal">Centro</th>
                  <th className="p-2 text-right font-normal">Receitas</th>
                  <th className="p-2 text-right font-normal">Despesas</th>
                  <th className="p-2 text-right font-normal">Resultado</th>
                  <th className="hidden w-1/4 p-2 sm:table-cell" />
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {(centers ?? []).map((c) => {
                  const v = totals.get(c.id) ?? { inc: 0, exp: 0 };
                  const res = v.inc - v.exp;
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="p-2">
                        <Link className="hover:underline" href={`/w/${workspaceId}/lancamentos?mes=${month}&centro=${c.id}`}>
                          {c.name}
                        </Link>
                      </td>
                      <td className="p-2 text-right">{v.inc ? formatBRL(v.inc) : "—"}</td>
                      <td className="p-2 text-right">{v.exp ? formatBRL(v.exp) : "—"}</td>
                      <td className={`p-2 text-right font-medium ${res < 0 ? "text-danger" : res > 0 ? "text-primary" : ""}`}>{formatBRL(res)}</td>
                      <td className="hidden p-2 sm:table-cell">
                        <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                          <div className="h-full rounded-full bg-danger/70" style={{ width: `${(v.exp / maxExp) * 100}%` }} />
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        {canEdit && (
                          <form action={deleteCostCenter}>
                            <input type="hidden" name="workspaceId" value={workspaceId} />
                            <input type="hidden" name="id" value={c.id} />
                            <ConfirmButton className="text-xs text-muted hover:text-danger" message={`Excluir "${c.name}"? Os lançamentos continuam, só perdem o centro.`}>
                              Excluir
                            </ConfirmButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
