"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, firstIssue, getActionClient, isoDate, optionalUuid, uuid, type FormState } from "@/lib/actions";
import { parseMoneyToCents } from "@/lib/finance/money";
import { userRateLimit } from "@/lib/rate-limit";

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

const schema = z.object({
  workspaceId: uuid,
  kind: z.enum(["expense", "income"]),
  description: z.string().trim().min(1, "Informe a descrição").max(300),
  amount: money,
  dueDate: isoDate,
  accountId: uuid,
  categoryId: optionalUuid,
  installments: z.coerce.number().int().min(1, "Parcelas inválidas").max(120, "Máximo de 120 parcelas").catch(1),
  reserve: z.string().optional(),
});

/**
 * Conta futura avulsa (IPVA, matrícula, viagem…) ou parcelada. Fica "prevista" em A pagar/receber,
 * entra na projeção e, se marcada, na reserva mensal.
 */
export async function createFutureBill(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  const { supabase, user } = await getActionClient();
  if (!(await userRateLimit(supabase, user.id, "future-bill", 60, 60_000))) return { ok: false, message: "Muitas tentativas seguidas. Aguarde um pouco." };

  if (v.installments > 1) {
    const { error } = await supabase.rpc("create_installments", {
      p_workspace_id: v.workspaceId,
      p_account_id: v.accountId,
      p_type: v.kind,
      p_total_cents: v.amount,
      p_count: v.installments,
      p_first_date: v.dueDate,
      p_description: v.description,
      p_category_id: v.categoryId,
      p_contact_id: null,
      p_first_paid: false,
    });
    if (error) return { ok: false, message: dbErrorMessage(error) };
  } else {
    const { error } = await supabase.from("transactions").insert({
      workspace_id: v.workspaceId,
      account_id: v.accountId,
      type: v.kind,
      direction: v.kind === "income" ? 1 : -1,
      amount_cents: v.amount,
      description: v.description,
      due_date: v.dueDate,
      competence_date: v.dueDate,
      status: "planned",
      category_id: v.categoryId,
      plan_reserve: v.kind === "expense" && v.reserve === "on",
    });
    if (error) return { ok: false, message: dbErrorMessage(error) };
  }
  revalidatePath(`/w/${v.workspaceId}`, "layout");
  return { ok: true, message: v.installments > 1 ? `Conta futura criada em ${v.installments} parcelas.` : "Conta futura criada." };
}

const reserveSchema = z.object({ workspaceId: uuid, id: uuid, on: z.enum(["true", "false"]) });

/** Liga/desliga a reserva mensal de uma conta futura. */
export async function setReserve(form: FormData) {
  const v = reserveSchema.safeParse(Object.fromEntries(form));
  if (!v.success) return;
  const { supabase } = await getActionClient();
  await supabase
    .from("transactions")
    .update({ plan_reserve: v.data.on === "true" })
    .eq("workspace_id", v.data.workspaceId)
    .eq("id", v.data.id)
    .eq("type", "expense");
  revalidatePath(`/w/${v.data.workspaceId}/planejamento`);
}
