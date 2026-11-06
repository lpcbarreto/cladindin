"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, getActionClient, uuid, type FormState } from "@/lib/actions";
import { parseMoneyToCents } from "@/lib/finance/money";

export async function decideApproval(form: FormData) {
  const workspaceId = uuid.parse(form.get("workspaceId"));
  const id = uuid.parse(form.get("id"));
  const decision = z.enum(["approved", "rejected"]).parse(form.get("decision"));
  const { supabase, user } = await getActionClient();
  const patch: Record<string, unknown> = { approval: decision, approved_by: user.id, approved_at: new Date().toISOString() };
  if (decision === "rejected") patch.status = "cancelled";
  await supabase.from("transactions").update(patch).eq("id", id).eq("workspace_id", workspaceId).eq("approval", "pending");
  revalidatePath(`/w/${workspaceId}`, "layout");
}

/** Valor acima do qual despesas lançadas por quem não é administrador precisam de aprovação. Vazio = desligado. */
export async function setApprovalThreshold(_prev: FormState, form: FormData): Promise<FormState> {
  const workspaceId = uuid.parse(form.get("workspaceId"));
  const raw = String(form.get("threshold") ?? "").trim();
  let cents: number | null = null;
  if (raw) {
    try {
      cents = Math.abs(parseMoneyToCents(raw));
    } catch {
      return { ok: false, message: "Valor inválido." };
    }
    if (!cents) return { ok: false, message: "Informe um valor maior que zero, ou deixe vazio para desligar." };
  }
  const { supabase } = await getActionClient();
  const { error } = await supabase.from("workspaces").update({ approval_threshold_cents: cents }).eq("id", workspaceId);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/w/${workspaceId}/equipe`);
  return { ok: true, message: cents ? "Limite salvo." : "Aprovação desligada." };
}
