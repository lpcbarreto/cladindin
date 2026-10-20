"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, firstIssue, formObject, getActionClient, isoDate, optionalText, uuid, type FormState } from "@/lib/actions";
import { parseMoneyToCents } from "@/lib/finance/money";

const money = z.string().transform((v, ctx) => {
  try {
    const cents = Math.abs(parseMoneyToCents(v));
    if (cents === 0) throw new Error();
    return cents;
  } catch {
    ctx.addIssue({ code: "custom", message: "Informe um valor maior que zero" });
    return z.NEVER;
  }
});

const goalSchema = z.object({
  workspaceId: uuid,
  name: z.string().trim().min(1, "Dê um nome à meta").max(80),
  emoji: z.string().trim().max(8).optional(),
  target: money,
  targetDate: isoDate.optional().or(z.literal("")),
});

export async function createGoal(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = goalSchema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  const { supabase } = await getActionClient();
  const { error } = await supabase.from("savings_goals").insert({
    workspace_id: v.workspaceId,
    name: v.name,
    emoji: v.emoji || null,
    target_cents: v.target,
    target_date: v.targetDate || null,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/w/${v.workspaceId}/metas`);
  return { ok: true, message: "Meta criada." };
}

const contribSchema = z.object({
  workspaceId: uuid,
  goalId: uuid,
  amount: money,
  kind: z.enum(["in", "out"]),
  date: isoDate,
  note: optionalText,
});

export async function addContribution(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = contribSchema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  const { supabase } = await getActionClient();
  const { error } = await supabase.from("goal_contributions").insert({
    workspace_id: v.workspaceId,
    goal_id: v.goalId,
    amount_cents: v.kind === "in" ? v.amount : -v.amount,
    date: v.date,
    note: v.note,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/w/${v.workspaceId}/metas`);
  return { ok: true, message: v.kind === "in" ? "Guardado! 💰" : "Retirada registrada." };
}

const idSchema = z.object({ workspaceId: uuid, id: uuid, op: z.enum(["archive", "unarchive", "delete"]) });

export async function goalOp(form: FormData) {
  const parsed = idSchema.safeParse(formObject(form));
  if (!parsed.success) return;
  const v = parsed.data;
  const { supabase } = await getActionClient();
  const q = supabase.from("savings_goals");
  if (v.op === "delete") await q.delete().eq("id", v.id).eq("workspace_id", v.workspaceId);
  else await q.update({ archived: v.op === "archive" }).eq("id", v.id).eq("workspace_id", v.workspaceId);
  revalidatePath(`/w/${v.workspaceId}/metas`);
}
