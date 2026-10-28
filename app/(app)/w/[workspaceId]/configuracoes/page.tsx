import { loadWorkspaceContext, hasRole, ROLE_LABEL, type Role } from "@/lib/workspace";
import { changeRole, removeMember, revokeInvite, transferOwnership } from "./actions";
import { ConfirmButton } from "@/components/confirm-button";
import { DeleteWorkspaceForm, DemoDataForm, InviteForm, NewWorkspaceForm, NotificationPrefsForm } from "./forms";
import { SecuritySettings } from "@/components/security-settings";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { DeleteAccountForm, ProfileNameForm } from "./account-forms";

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

  const [{ data: prefs }, { data: profile }] = await Promise.all([
    supabase.from("notification_prefs").select("due_alerts, weekly_summary, days_before").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Configurações</h1>

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
                    {current.role === "owner" && (
                      <form action={transferOwnership}>
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="id" value={m.user_id} />
                        <ConfirmButton
                          message={`Tornar ${profile?.full_name || "este membro"} proprietário de “${current.name}”? Você passa a ser administrador.`}
                          className="btn-ghost py-1"
                        >
                          Tornar proprietário
                        </ConfirmButton>
                      </form>
                    )}
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

      <section className="card space-y-3">
        <h2 className="font-medium">Avisos por e-mail</h2>
        <p className="text-sm text-muted">Enviados para {user.email}. Valem para todos os seus workspaces.</p>
        <NotificationPrefsForm prefs={prefs ?? { due_alerts: true, weekly_summary: true, days_before: 1 }} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Segurança</h2>
        <SecuritySettings />
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Aparência</h2>
        <p className="text-sm text-muted">Escolha o tema claro, o escuro ou siga a configuração do seu sistema.</p>
        <div className="max-w-sm">
          <ThemeToggle showLabels />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-medium">Novo workspace</h2>
        <NewWorkspaceForm />
      </section>

      {canManage && <DemoDataForm workspaceId={workspaceId} />}

      <section className="card space-y-3">
        <h2 className="font-medium">Seus dados (LGPD)</h2>
        <p className="text-sm text-muted">
          Baixe uma cópia dos seus dados, corrija seu nome ou exclua sua conta. Saiba mais na{" "}
          <Link href="/privacidade" className="underline">
            Política de Privacidade
          </Link>{" "}
          e em{" "}
          <Link href="/lgpd" className="underline">
            Seus direitos
          </Link>
          .
        </p>
        <ProfileNameForm name={profile?.full_name ?? null} />
        <div className="flex flex-wrap gap-2">
          <a href={`/w/${workspaceId}/configuracoes/minha-conta`} className="btn-ghost">
            Baixar dados da minha conta (JSON)
          </a>
          <a href={`/w/${workspaceId}/configuracoes/exportar`} className="btn-ghost">
            Baixar dados de “{current.name}” (JSON)
          </a>
        </div>
        {current.role === "owner" && (
          <div className="space-y-2 border-t border-border pt-4">
            <h3 className="font-semibold text-danger">Excluir workspace</h3>
            <p className="text-sm text-muted">
              Apaga de forma definitiva todos os lançamentos, contas, comprovantes e membros deste workspace. Não dá para desfazer: baixe seus
              dados antes.
            </p>
            <DeleteWorkspaceForm workspaceId={workspaceId} name={current.name} />
          </div>
        )}
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="font-semibold text-danger">Excluir minha conta</h3>
          <p className="text-sm text-muted">
            Apaga sua conta de acesso e todos os workspaces em que só você está, com lançamentos e comprovantes. Nos workspaces compartilhados, o que
            você registrou continua lá para os outros membros, sem o seu nome. Não dá para desfazer: baixe seus dados antes.
          </p>
          <DeleteAccountForm email={user.email ?? ""} />
        </div>
      </section>
    </div>
  );
}
