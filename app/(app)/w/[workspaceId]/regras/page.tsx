import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { loadOptions } from "@/lib/transactions";
import { formatBRL } from "@/lib/finance/money";
import { RULE_SELECT, type RuleRecord } from "@/lib/rules-server";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteRule, toggleRule } from "./actions";
import { CategorizationRuleForm } from "./rule-form";
import { ReapplyForm } from "./reapply-form";

const OP = { contains: "contém", starts_with: "começa com", equals: "é igual a", regex: "casa com" } as const;

export default async function RulesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");
  const [options, { data }] = await Promise.all([
    loadOptions(supabase, workspaceId),
    supabase.from("categorization_rules").select(RULE_SELECT).eq("workspace_id", workspaceId).order("priority").order("pattern"),
  ]);
  const rules = (data ?? []) as RuleRecord[];
  const cat = new Map(options.categories.map((c) => [c.id, c.name]));
  const contact = new Map(options.contacts.map((c) => [c.id, c.name]));
  const account = new Map(options.accounts.map((a) => [a.id, a.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Regras de categorização</h1>
        <p className="text-sm text-muted">Aplicadas automaticamente na importação de extratos e faturas.</p>
      </div>

      {canEdit && (
        <details className="card" open={rules.length === 0}>
          <summary className="cursor-pointer font-bold">Nova regra</summary>
          <div className="mt-4">
            <CategorizationRuleForm workspaceId={workspaceId} options={options} />
          </div>
        </details>
      )}

      {canEdit && rules.length > 0 && (
        <div className="card">
          <ReapplyForm workspaceId={workspaceId} />
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-border">
              <th className="p-3 font-normal">Quando</th>
              <th className="p-3 font-normal">Então</th>
              <th className="p-3 font-normal">Usos</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className={`border-b border-border last:border-0 ${r.active ? "" : "opacity-50"}`}>
                <td className="p-3">
                  <span className="text-muted">descrição {OP[r.operator]}</span> <b>“{r.pattern}”</b>
                  <span className="block text-xs text-muted">
                    {[
                      r.direction === "out" ? "só saídas" : r.direction === "in" ? "só entradas" : null,
                      r.amount_min_cents !== null ? `≥ ${formatBRL(r.amount_min_cents)}` : null,
                      r.amount_max_cents !== null ? `≤ ${formatBRL(r.amount_max_cents)}` : null,
                      r.account_id ? `conta ${account.get(r.account_id) ?? "?"}` : null,
                      `prioridade ${r.priority}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </td>
                <td className="p-3">
                  {r.set_category_id && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">{cat.get(r.set_category_id) ?? "categoria"}</span>}{" "}
                  {r.set_contact_id && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">{contact.get(r.set_contact_id) ?? "contato"}</span>}
                </td>
                <td className="p-3 text-muted tabular-nums">{r.times_applied}</td>
                <td className="p-3">
                  {canEdit && (
                    <div className="flex justify-end gap-2">
                      <form action={toggleRule}>
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="active" value={String(!r.active)} />
                        <button className="text-xs text-muted hover:underline">{r.active ? "Desativar" : "Ativar"}</button>
                      </form>
                      <form action={deleteRule}>
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmButton message="Excluir esta regra? Lançamentos já categorizados não mudam." className="text-xs text-danger hover:underline">
                          Excluir
                        </ConfirmButton>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted">
                  Nenhuma regra. Dica: ao editar um lançamento, use “Criar regra para parecidos”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
