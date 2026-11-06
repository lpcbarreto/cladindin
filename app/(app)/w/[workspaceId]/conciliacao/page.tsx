import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { hasRole, loadWorkspaceContext } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { addDays, formatDateBR, todayISO } from "@/lib/finance/dates";
import { suggestMatches } from "@/lib/importers/reconcile";
import { dismissLine, joinMany, joinPair } from "./actions";

export const metadata = { title: "Conciliação" };

export default async function ReconcilePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");
  const today = todayISO();
  const since = addDays(today, -60);

  const [{ data: imported }, { data: planned }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, account_id, paid_date, amount_cents, direction, description, statement_description, account:accounts(name)")
      .eq("workspace_id", workspaceId)
      .eq("origin", "import")
      .eq("status", "paid")
      .eq("reconciled", false)
      .eq("match_dismissed", false)
      .is("deleted_at", null)
      .gte("paid_date", since)
      .order("paid_date", { ascending: false })
      .limit(300),
    supabase
      .from("transactions")
      .select("id, account_id, due_date, amount_cents, direction, description")
      .eq("workspace_id", workspaceId)
      .eq("status", "planned")
      .neq("type", "transfer")
      .is("deleted_at", null)
      .is("invoice_id", null)
      .gte("due_date", addDays(since, -7))
      .lte("due_date", addDays(today, 7))
      .limit(1000),
  ]);

  const plannedById = new Map((planned ?? []).map((p) => [p.id, p]));
  const suggestions = suggestMatches(
    (imported ?? []).map((t) => ({
      id: t.id,
      accountId: t.account_id,
      date: t.paid_date!,
      amountCents: t.amount_cents * t.direction,
      description: t.statement_description ?? t.description,
    })),
    (planned ?? []).map((p) => ({ id: p.id, accountId: p.account_id, date: p.due_date, amountCents: p.amount_cents * p.direction, description: p.description })),
  ).filter((s) => s.planned);
  const accountName = new Map((imported ?? []).map((t) => [t.id, (t.account as unknown as { name: string } | null)?.name ?? ""]));
  const high = suggestions.filter((s) => s.confidence === "high");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Conciliação</h1>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Linhas de extrato importadas que parecem ser contas que você já tinha previsto. Ao juntar, o previsto vira pago com a data e o valor do banco, e nada fica duplicado.
          </p>
        </div>
        {canEdit && high.length > 1 && (
          <form action={joinMany}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            {high.map((s) => (
              <input key={s.line.id} type="hidden" name="pair" value={`${s.line.id}:${s.planned!.id}`} />
            ))}
            <button className="btn">Juntar as {high.length} com certeza alta</button>
          </form>
        )}
      </div>

      {suggestions.length === 0 ? (
        <EmptyState
          icon="check"
          title="Tudo conferido"
          hint="Nenhuma linha dos extratos dos últimos 60 dias parece com uma conta prevista. Novas sugestões aparecem quando você importar outro extrato."
          action={canEdit ? { href: `/w/${workspaceId}/importar`, label: "Importar extrato" } : undefined}
        />
      ) : (
        <ul className="card divide-y divide-border p-0">
          {suggestions.map((s) => {
            const p = plannedById.get(s.planned!.id)!;
            return (
              <li key={s.line.id} className="grid items-center gap-3 p-4 md:grid-cols-[1fr_auto_1fr_auto]">
                <div className="min-w-0 rounded-xl border border-border p-3">
                  <p className="truncate font-medium">{s.line.description}</p>
                  <p className="text-xs text-muted tabular-nums">
                    Extrato · {accountName.get(s.line.id)} · {formatDateBR(s.line.date)} · {formatBRL(s.line.amountCents)}
                  </p>
                </div>
                <span
                  className={`hidden h-0.5 w-10 md:block ${s.confidence === "high" ? "bg-brand" : "bg-border"}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 rounded-xl border border-border p-3">
                  <Link href={`/w/${workspaceId}/lancamentos/${p.id}`} className="truncate font-medium hover:underline">
                    {p.description}
                  </Link>
                  <p className="text-xs text-muted tabular-nums">
                    Previsto · vence {formatDateBR(p.due_date)} · {formatBRL(p.amount_cents * p.direction)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.confidence === "high" ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted"}`}>
                    {s.confidence === "high" ? "Certeza alta" : "Confira"}
                  </span>
                  {canEdit && (
                    <>
                      <form action={joinPair}>
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="imported" value={s.line.id} />
                        <input type="hidden" name="planned" value={p.id} />
                        <button className="btn">Juntar</button>
                      </form>
                      <form action={dismissLine}>
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="imported" value={s.line.id} />
                        <button className="btn-ghost">Não é</button>
                      </form>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
