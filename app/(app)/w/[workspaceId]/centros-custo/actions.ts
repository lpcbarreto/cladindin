"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, firstIssue, formObject, getActionClient, uuid, type FormState } from "@/lib/actions";

const schema = z.object({ workspaceId: uuid, name: z.string().trim().min(1, "Informe o nome").max(60, "Use até 60 letras") });

export async function createCostCenter(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = schema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { supabase } = await getActionClient();
  const { error } = await supabase.from("cost_centers").insert({ workspace_id: parsed.data.workspaceId, name: parsed.data.name });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/w/${parsed.data.workspaceId}`, "layout");
  return { ok: true, message: "Centro de custo criado." };
}

export async function deleteCostCenter(form: FormData) {
  const workspaceId = uuid.parse(form.get("workspaceId"));
  const id = uuid.parse(form.get("id"));
  const { supabase } = await getActionClient();
  // Os lançamentos ficam, só perdem o vínculo (on delete set null)
  await supabase.from("cost_centers").delete().eq("id", id).eq("workspace_id", workspaceId);
  revalidatePath(`/w/${workspaceId}`, "layout");
}
