import { loadWorkspaceContext, hasRole, ROLE_LABEL, type Role } from "@/lib/workspace";
import { changeRole, removeMember, revokeInvite } from "./actions";
import { InviteForm, NewWorkspaceForm } from "./forms";

export default async function SettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, user, current } = await loadWorkspaceContext(workspaceId);
  const canManage = hasRole(current.role, "admin");

  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id, role, profile:profiles(full_name)")
    .eq("workspace_id", workspaceId)
    .order("created_at");

  const { data: invites } = canManage
    ? await supabase
        .from("invites")
        .select("id, email, role, expires_at")
        .eq("workspace_id", workspaceId)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
    : { data: [] };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Configurações</h1>

      <section className="card space-y-4">
        <h2 className="font-medium">Membros de “{current.name}”</h2>
        <ul className="divide-y divide-border">
          {(members ?? []).map((m) => {
            const role = m.role as Role;
            const profile = m.profile as unknown as { full_name: string | null } | null;
            const editable = canManage && role !== "owner" && m.user_id !== user.id;
            return (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {profile?.full_name || "Sem nome"}
                  {m.user_id === user.id && <span className="text-muted"> (você)</span>}
                </span>
                {editable ? (
                  <div className="flex gap-2">
                    <form action={changeRole} className="flex gap-2">
                      <input type="hidden" name="workspaceId" value={workspaceId} />
                      <input type="hidden" name="id" value={m.user_id} />
                      <select name="role" defaultValue={role} className="input w-auto py-1">
                        <option value="admin">Administrador</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Leitor</option>
                      </select>
                      <button className="btn-ghost py-1">Salvar</button>
                    </form>
                    <form action={removeMember}>
                      <input type="hidden" name="workspaceId" value={workspaceId} />
                      <input type="hidden" name="id" value={m.user_id} />
                      <button className="btn-ghost py-1 text-danger">Remover</button>
                    </form>
                  </div>
                ) : (
                  <span className="text-muted">{ROLE_LABEL[role]}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {canManage && (
        <section className="card space-y-4">
          <h2 className="font-medium">Convidar pessoa</h2>
          <InviteForm workspaceId={workspaceId} />
          {(invites ?? []).length > 0 && (
            <ul className="divide-y divide-border text-sm">
              {invites!.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2">
                  <span>
                    {i.email} · {ROLE_LABEL[i.role as Role]} · expira em{" "}
                    {new Date(i.expires_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </span>
                  <form action={revokeInvite}>
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="id" value={i.id} />
                    <button className="btn-ghost py-1">Revogar</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card space-y-4">
        <h2 className="font-medium">Novo workspace</h2>
        <NewWorkspaceForm />
      </section>
    </div>
  );
}
