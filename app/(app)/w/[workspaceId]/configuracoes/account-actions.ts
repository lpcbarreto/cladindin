"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionClient, type FormState } from "@/lib/actions";
import { adminClient } from "@/lib/supabase/admin";
import { TERMS_VERSION } from "@/lib/legal";

/** Corrigir o nome (LGPD, art. 18, III). Vazio = sem nome (é opcional). */
export async function updateProfileName(_prev: FormState, form: FormData): Promise<FormState> {
  const name = z.string().trim().max(120).safeParse(form.get("name") ?? "");
  if (!name.success) return { ok: false, message: "Nome muito longo." };
  const { supabase, user } = await getActionClient();
  const { error } = await supabase.from("profiles").update({ full_name: name.data || null }).eq("id", user.id);
  if (error) return { ok: false, message: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Nome atualizado." };
}

/** Aceite da versão atual dos Termos e da Política (quando forem atualizados). */
export async function acceptCurrentTerms() {
  const { supabase } = await getActionClient();
  await supabase.auth.updateUser({ data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() } });
  // Renova o token para o aceite valer já (o aviso some na hora)
  await supabase.auth.refreshSession();
  revalidatePath("/", "layout");
}

/**
 * Excluir a conta (LGPD, art. 18, VI). Apaga os workspaces que só a pessoa usa (com comprovantes)
 * e a conta de acesso. Em workspaces compartilhados, a autoria dos registros fica anônima.
 */
export async function deleteMyAccount(_prev: FormState, form: FormData): Promise<FormState> {
  const { user } = await getActionClient();
  const typed = String(form.get("confirmEmail") ?? "").trim().toLowerCase();
  if (!user.email || typed !== user.email.toLowerCase()) return { ok: false, message: "Digite exatamente o e-mail da sua conta para confirmar." };

  const db = adminClient();
  if (!db) return { ok: false, message: "Exclusão indisponível no momento. Peça pela página Seus direitos (LGPD)." };

  const { data: mine } = await db.from("workspace_members").select("workspace_id, role, workspace:workspaces(name)").eq("user_id", user.id);
  const owned = (mine ?? []).filter((m) => m.role === "owner").map((m) => m.workspace_id as string);

  // Workspaces em que a pessoa é dona e há outros membros: precisam de outro dono antes
  const blocked: string[] = [];
  for (const ws of owned) {
    const { count } = await db.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws).neq("user_id", user.id);
    if ((count ?? 0) > 0) {
      const name = (mine ?? []).find((m) => m.workspace_id === ws)?.workspace as unknown as { name: string } | null;
      blocked.push(name?.name ?? "workspace");
    }
  }
  if (blocked.length) {
    return {
      ok: false,
      message: `Você é dono de workspace(s) com outras pessoas: ${blocked.join(", ")}. Torne outra pessoa proprietária (em Configurações › Membros), remova os outros membros ou exclua esses workspaces antes.`,
    };
  }

  // Comprovantes no armazenamento dos workspaces que serão apagados
  for (const ws of owned) {
    for (let page = 0; page < 100; page++) {
      const { data: files } = await db.from("attachments").select("storage_path").eq("workspace_id", ws).range(page * 500, page * 500 + 499);
      if (!files?.length) break;
      await db.storage.from("comprovantes").remove(files.map((f) => f.storage_path));
      if (files.length < 500) break;
    }
  }
  if (owned.length) {
    const { error } = await db.from("workspaces").delete().in("id", owned);
    if (error) return { ok: false, message: "Não foi possível concluir a exclusão. Sua conta continua ativa; tente de novo ou peça pela página Seus direitos (LGPD)." };
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, message: "Seus workspaces foram apagados, mas a conta não. Tente de novo ou peça pela página Seus direitos (LGPD)." };
  // Encerra a sessão: apaga os cookies do Supabase (a conta já não existe)
  const jar = await cookies();
  for (const c of jar.getAll()) if (c.name.startsWith("sb-")) jar.delete(c.name);
  redirect("/login?excluida=1");
}
