import Link from "next/link";
import { hasRole, loadWorkspaceContext } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { formatDateBR } from "@/lib/finance/dates";
import { describeAudit, type AuditRow } from "@/lib/audit";
import { decideApproval } from "./actions";
import { ThresholdForm } from "./threshold-form";

export const metadata = { title: "Equipe e aprovações" };

const ROLE_LABEL: Record<string, string> = { owner: "Proprietário", admin: "Administrador", editor: "Lança", viewer: "Só vê" };
const ROLE_HINT: Record<string, string> = {
  owner: "Tudo, inclusive excluir o espaço",
  admin: "Tudo, inclusive aprovar pagamentos e convidar pessoas",
  editor: "Cria e edita lançamentos; acima do limite, precisa de aprovação",
  viewer: "Vê relatórios e lançamentos, sem alterar",
};

export default async function TeamPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, current, user } = await loadWorkspaceContext(workspaceId);
  const isAdmin = hasRole(current.role, "admin");

  const [{ data: members }, { data: ws }, { data: pending }, { data: audit }] = await Promise.all([
    supabase.from("workspace_members").select("user_id, role, profile:profiles(full_name)").eq("workspace_id", workspaceId),
    supabase.from("workspaces").select("approval_threshold_cents").eq("id", workspaceId).single(),
    supabase
      .from("transactions")
      .select("id, description, amount_cents, due_date, created_by, account:accounts(name)")
      .eq("workspace_id", workspaceId)
      .eq("approval", "pending")
      .is("deleted_at", null)
      .order("due_date")
      .limit(100),
    isAdmin
      ? supabase
          .from("audit_log")
          .select("id, table_name, action, actor_id, old_data, new_data, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(120)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const nameOf = new Map(
    (members ?? []).map((m) => [m.user_id, m.user_id === user.id ? "Você" : (m.profile as unknown as { full_name: string | null } | null)?.full_name || "Alguém da equipe"]),
  );
  const history = (audit ?? [])
    .map((a) => ({ ...a, text: describeAudit(a as AuditRow) }))
    .filter((a) => a.text)
    .slice(0, 60);
  const threshold = ws?.approval_threshold_cents ? (Number(ws.approval_threshold_cents) / 100).toFixed(2).replace(".", ",") : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Equipe e aprovações</h1>
          <p className="mt-1 text-sm text-muted">Quem vê, quem lança e quem aprova em “{current.name}”.</p>
        </div>
        {isAdmin && (
          <Link href={`/w/${workspaceId}/configuracoes`} className="btn">
            Convidar ou mudar papéis
          </Link>
        )}
      </div>

      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-border">
              <th className="p-3 font-normal">Pessoa</th>
              <th className="p-3 font-normal">Papel</th>
              <th className="p-3 font-normal">O que pode fazer</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.user_id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <span className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold" aria-hidden="true">
                      {(nameOf.get(m.user_id) ?? "?").charAt(0).toUpperCase()}
                    </span>
                    {nameOf.get(m.user_id)}
                  </span>
                </td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.role === "owner" || m.role === "admin" ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted"}`}>
                    {ROLE_LABEL[m.role]}
                  </span>
                </td>
                <td className="p-3 text-muted">{ROLE_HINT[m.role]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">Aguardando aprovação</h2>
            {(pending ?? []).length > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold">{pending!.length}</span>}
          </div>
          {isAdmin && <ThresholdForm workspaceId={workspaceId} value={threshold} />}
          {!isAdmin && (
            <p className="text-sm text-muted">
              {threshold ? `Despesas acima de R$ ${threshold} que você lançar esperam um administrador aprovar.` : "Este espaço não pede aprovação de pagamentos."}
            </p>
          )}
          {(pending ?? []).length === 0 ? (
            <p className="text-sm text-muted">Nada aguardando.</p>
          ) : (
            <ul className="divide-y divide-border">
              {pending!.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/w/${workspaceId}/lancamentos/${t.id}`} className="font-medium hover:underline">
                      {t.description}
                    </Link>
                    <p className="text-xs text-muted">
                      {t.created_by ? `lançado por ${nameOf.get(t.created_by) ?? "alguém"}` : ""} · vence {formatDateBR(t.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <b className="tabular-nums">{formatBRL(t.amount_cents)}</b>
                    {isAdmin && (
                      <>
                        <form action={decideApproval}>
                          <input type="hidden" name="workspaceId" value={workspaceId} />
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="decision" value="approved" />
                          <button className="btn py-1">Aprovar</button>
                        </form>
                        <form action={decideApproval}>
                          <input type="hidden" name="workspaceId" value={workspaceId} />
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="decision" value="rejected" />
                          <button className="btn-ghost py-1">Recusar</button>
                        </form>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-3">
          <h2 className="font-medium">Histórico de alterações</h2>
          {!isAdmin ? (
            <p className="text-sm text-muted">Só administradores veem o histórico.</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma alteração registrada ainda.</p>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto pr-1 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex justify-between gap-3 py-2.5">
                  <span>
                    <b>{h.actor_id ? (nameOf.get(h.actor_id) ?? "Ex-membro") : "O sistema"}</b> {h.text}
                  </span>
                  <time className="shrink-0 text-xs text-muted tabular-nums" dateTime={h.created_at}>
                    {new Date(h.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
