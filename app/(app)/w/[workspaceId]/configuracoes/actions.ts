"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { ok: boolean; message: string; link?: string } | null;

const inviteSchema = z.object({
  workspaceId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: z.enum(["admin", "editor", "viewer"]),
});

export async function createInvite(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sessão expirada." };

  const { data, error } = await supabase
    .from("invites")
    .insert({ workspace_id: parsed.data.workspaceId, email: parsed.data.email, role: parsed.data.role, created_by: user.id })
    .select("token")
    .single();
  if (error) return { ok: false, message: "Sem permissão para convidar neste workspace." };

  revalidatePath(`/w/${parsed.data.workspaceId}/configuracoes`);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    ok: true,
    message: "Convite criado. Envie este link para a pessoa (vale 7 dias):",
    link: `${site}/convite/${data.token}`,
  };
}

const idSchema = z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() });

export async function revokeInvite(form: FormData) {
  const { workspaceId, id } = idSchema.parse(Object.fromEntries(form));
  const supabase = await createClient();
  await supabase.from("invites").delete().eq("id", id).eq("workspace_id", workspaceId);
  revalidatePath(`/w/${workspaceId}/configuracoes`);
}

export async function removeMember(form: FormData) {
  const { workspaceId, id } = idSchema.parse(Object.fromEntries(form));
  const supabase = await createClient();
  await supabase.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", id);
  revalidatePath(`/w/${workspaceId}/configuracoes`);
}

const roleSchema = idSchema.extend({ role: z.enum(["admin", "editor", "viewer"]) });

export async function changeRole(form: FormData) {
  const { workspaceId, id, role } = roleSchema.parse(Object.fromEntries(form));
  const supabase = await createClient();
  await supabase.from("workspace_members").update({ role }).eq("workspace_id", workspaceId).eq("user_id", id);
  revalidatePath(`/w/${workspaceId}/configuracoes`);
}

const wsSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(80),
  kind: z.enum(["pf", "pj"]),
});

export async function createWorkspace(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = wsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace", { p_name: parsed.data.name, p_kind: parsed.data.kind });
  if (error || !data) return { ok: false, message: "Não foi possível criar o workspace." };
  redirect(`/w/${data}/dashboard`);
}

const deleteSchema = z.object({ workspaceId: z.string().uuid(), confirmName: z.string().trim().min(1, "Digite o nome do workspace") });

/** LGPD: exclui o workspace e todos os dados (somente o proprietário; exige digitar o nome). */
export async function deleteWorkspace(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = deleteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { workspaceId, confirmName } = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: ws }, { data: me }] = await Promise.all([
    supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    supabase.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user?.id ?? "").maybeSingle(),
  ]);
  if (!ws || me?.role !== "owner") return { ok: false, message: "Só o proprietário pode excluir o workspace." };
  if (ws.name !== confirmName) return { ok: false, message: "O nome digitado não confere." };

  // Comprovantes no Storage: <workspace>/<lançamento>/<arquivo>
  const { data: folders } = await supabase.storage.from("comprovantes").list(workspaceId, { limit: 1000 });
  for (const folder of folders ?? []) {
    const { data: files } = await supabase.storage.from("comprovantes").list(`${workspaceId}/${folder.name}`, { limit: 1000 });
    if (files?.length) await supabase.storage.from("comprovantes").remove(files.map((f) => `${workspaceId}/${folder.name}/${f.name}`));
  }

  const { error } = await supabase.rpc("delete_workspace", { p_workspace_id: workspaceId, p_confirm_name: confirmName });
  if (error) return { ok: false, message: error.message };
  redirect("/");
}
