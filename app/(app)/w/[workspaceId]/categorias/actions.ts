"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, firstIssue, formObject, getActionClient, optionalUuid, uuid, type FormState } from "@/lib/actions";

const schema = z.object({
  workspaceId: uuid,
  name: z.string().trim().min(1, "Informe o nome").max(60),
  kind: z.enum(["income", "expense"]),
  parentId: optionalUuid,
});

export async function createCategory(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = schema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  const { supabase } = await getActionClient();

  let kind = v.kind;
  if (v.parentId) {
    const { data: parent } = await supabase.from("categories").select("kind").eq("id", v.parentId).single();
    if (!parent) return { ok: false, message: "Categoria pai não encontrada." };
    kind = parent.kind;
  }
  const { error } = await supabase
    .from("categories")
    .insert({ workspace_id: v.workspaceId, name: v.name, kind, parent_id: v.parentId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/w/${v.workspaceId}/categorias`);
  return { ok: true, message: "Categoria criada." };
}

const renameSchema = z.object({ workspaceId: uuid, id: uuid, name: z.string().trim().min(1).max(60) });

export async function renameCategory(form: FormData) {
  const v = renameSchema.parse(formObject(form));
  const { supabase } = await getActionClient();
  await supabase.from("categories").update({ name: v.name }).eq("id", v.id).eq("workspace_id", v.workspaceId);
  revalidatePath(`/w/${v.workspaceId}/categorias`);
}

const archiveSchema = z.object({ workspaceId: uuid, id: uuid, archived: z.enum(["true", "false"]) });

export async function archiveCategory(form: FormData) {
  const v = archiveSchema.parse(formObject(form));
  const { supabase } = await getActionClient();
  await supabase
    .from("categories")
    .update({ archived: v.archived === "true" })
    .eq("workspace_id", v.workspaceId)
    .or(`id.eq.${v.id},parent_id.eq.${v.id}`);
  revalidatePath(`/w/${v.workspaceId}/categorias`);
}
