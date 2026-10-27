import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { ACCOUNT_TYPE_LABEL, type AccountType } from "@/lib/finance/labels";
import { setArchived } from "./actions";
import { AccountForm } from "./account-form";
import { DeleteAccount } from "./delete-account";

export default async function AccountsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");
  const canDelete = hasRole(current.role, "admin");

  const { data: balances } = await supabase
    .from("account_balances")
    .select(
      "account_id, name, type, archived, balance_cents, projected_balance_cents",
    )
    .eq("workspace_id", workspaceId)
    .order("archived")
    .order("name");
  const { data: cards } = await supabase
    .from("credit_cards")
    .select("account_id, limit_cents, closing_day, due_day")
    .eq("workspace_id", workspaceId);
  const { data: txRows } = canDelete
    ? await supabase
        .from("transactions")
        .select("account_id")
        .eq("workspace_id", workspaceId)
        .limit(50000)
    : { data: [] };
  const txCount = new Map<string, number>();
  for (const t of txRows ?? [])
    txCount.set(t.account_id, (txCount.get(t.account_id) ?? 0) + 1);
  const cardById = new Map((cards ?? []).map((c) => [c.account_id, c]));
  const active = (balances ?? []).filter(
    (b) => !b.archived && b.type !== "credit_card",
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">
        Contas e cartões
      </h1>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-border">
              <th className="p-3 font-normal">Conta</th>
              <th className="p-3 font-normal">Tipo</th>
              <th className="p-3 text-right font-normal">Saldo atual</th>
              <th className="p-3 text-right font-normal">Saldo previsto</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(balances ?? []).map((b) => {
              const card = cardById.get(b.account_id);
              return (
                <tr
                  key={b.account_id}
                  className={`border-b border-border last:border-0 ${b.archived ? "opacity-50" : ""}`}
                >
                  <td className="p-3">
                    <Link
                      href={`/w/${workspaceId}/lancamentos?conta=${b.account_id}`}
                      className="hover:underline"
                    >
                      {b.name}
                    </Link>
                    {card && (
                      <span className="block text-xs text-muted">
                        Limite {formatBRL(card.limit_cents)} · fecha dia{" "}
                        {card.closing_day} · vence dia {card.due_day}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-muted">
                    {ACCOUNT_TYPE_LABEL[b.type as AccountType]}
                  </td>
                  <td
                    className={`p-3 text-right tabular-nums ${b.balance_cents < 0 ? "text-danger" : ""}`}
                  >
                    {formatBRL(b.balance_cents)}
                  </td>
                  <td className="p-3 text-right text-muted tabular-nums">
                    {formatBRL(b.projected_balance_cents)}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-start justify-end gap-3">
                      {canEdit && (
                        <form action={setArchived}>
                          <input
                            type="hidden"
                            name="workspaceId"
                            value={workspaceId}
                          />
                          <input type="hidden" name="id" value={b.account_id} />
                          <input
                            type="hidden"
                            name="archived"
                            value={String(!b.archived)}
                          />
                          <button className="text-xs text-muted hover:underline">
                            {b.archived ? "Reativar" : "Arquivar"}
                          </button>
                        </form>
                      )}
                      {canDelete && (
                        <DeleteAccount
                          workspaceId={workspaceId}
                          id={b.account_id}
                          name={b.name}
                          txCount={txCount.get(b.account_id) ?? 0}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {(balances ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-2">
                  <EmptyState
                    icon="bank"
                    title="Nenhuma conta ainda"
                    hint="Cadastre sua conta corrente, poupança, carteira ou cartão de crédito no formulário acima."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <section className="card space-y-4">
          <h2 className="font-medium">Nova conta</h2>
          <AccountForm
            workspaceId={workspaceId}
            paymentAccounts={active.map((a) => ({
              id: a.account_id,
              name: a.name,
            }))}
          />
        </section>
      )}
    </div>
  );
}
