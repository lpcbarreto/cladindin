"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, firstIssue, formObject, getActionClient, optionalText, optionalUuid, uuid, type FormState } from "@/lib/actions";
import { parseMoneyToCents } from "@/lib/finance/money";

const money = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v?.trim()) return 0;
    try {
      return parseMoneyToCents(v);
    } catch {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
  });

const day = z.coerce.number().int().min(1, "Dia inválido").max(31, "Dia inválido");

const accountSchema = z
  .object({
    workspaceId: uuid,
    name: z.string().trim().min(1, "Informe o nome").max(80),
    type: z.enum(["checking", "savings", "cash", "investment", "credit_card"]),
    initialBalance: money,
    bankCode: optionalText,
    branch: optionalText,
    number: optionalText,
    limit: money,
    closingDay: z.string().optional(),
    dueDay: z.string().optional(),
    paymentAccountId: optionalUuid,
  })
  .superRefine((v, ctx) => {
    if (v.type === "credit_card") {
      if (!day.safeParse(v.closingDay).success) ctx.addIssue({ code: "custom", message: "Informe o dia de fechamento (1 a 31)" });
      if (!day.safeParse(v.dueDay).success) ctx.addIssue({ code: "custom", message: "Informe o dia de vencimento (1 a 31)" });
    }
  });

export async function createAccount(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = accountSchema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  const { supabase } = await getActionClient();

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      workspace_id: v.workspaceId,
      name: v.name,
      type: v.type,
      initial_balance_cents: v.initialBalance,
      bank_code: v.bankCode,
      branch: v.branch,
      number: v.number,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: dbErrorMessage(error) };

  if (v.type === "credit_card") {
    const { error: ccError } = await supabase.from("credit_cards").insert({
      account_id: data.id,
      workspace_id: v.workspaceId,
      limit_cents: v.limit,
      closing_day: Number(v.closingDay),
      due_day: Number(v.dueDay),
      default_payment_account_id: v.paymentAccountId,
    });
    if (ccError) {
      await supabase.from("accounts").delete().eq("id", data.id);
      return { ok: false, message: dbErrorMessage(ccError) };
    }
  }

  revalidatePath(`/w/${v.workspaceId}`, "layout");
  return { ok: true, message: "Conta criada." };
}

const toggleSchema = z.object({ workspaceId: uuid, id: uuid, archived: z.enum(["true", "false"]) });

export async function setArchived(form: FormData) {
  const v = toggleSchema.parse(formObject(form));
  const { supabase } = await getActionClient();
  await supabase.from("accounts").update({ archived: v.archived === "true" }).eq("id", v.id).eq("workspace_id", v.workspaceId);
  revalidatePath(`/w/${v.workspaceId}`, "layout");
}
