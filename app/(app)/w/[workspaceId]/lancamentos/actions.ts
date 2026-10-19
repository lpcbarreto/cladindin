"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  dbErrorMessage,
  firstIssue,
  formObject,
  getActionClient,
  isoDate,
  optionalText,
  optionalUuid,
  uuid,
  type FormState,
} from "@/lib/actions";
import { parseMoneyToCents } from "@/lib/finance/money";
import { todayISO } from "@/lib/finance/dates";

const amount = z.string().transform((v, ctx) => {
  try {
    const cents = Math.abs(parseMoneyToCents(v));
    if (cents === 0) throw new Error();
    return cents;
  } catch {
    ctx.addIssue({ code: "custom", message: "Informe um valor maior que zero" });
    return z.NEVER;
  }
});

const baseSchema = z.object({
  workspaceId: uuid,
  description: z.string().trim().min(1, "Informe a descrição").max(300),
  amount,
  dueDate: isoDate,
  competenceDate: isoDate.optional().or(z.literal("")),
  paid: z.string().optional(),
  notes: optionalText,
});

const txSchema = baseSchema.extend({
  type: z.enum(["income", "expense"]),
  accountId: uuid,
  categoryId: optionalUuid,
  contactId: optionalUuid,
});

const transferSchema = baseSchema.extend({
  type: z.literal("transfer"),
  fromAccountId: uuid,
  toAccountId: uuid,
});

const createSchema = z.discriminatedUnion("type", [
  txSchema.extend({
    // Valor informado é o TOTAL; dividido em N parcelas mensais
    installments: z.coerce.number().int().min(1, "Parcelas inválidas").max(120, "Máximo de 120 parcelas").optional().catch(1),
  }),
  transferSchema,
]);

function revalidate(workspaceId: string) {
  revalidatePath(`/w/${workspaceId}`, "layout");
}

export async function createTransaction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = createSchema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  const { supabase } = await getActionClient();
  const paid = v.paid === "on";

  if (v.type === "transfer") {
    if (v.fromAccountId === v.toAccountId) return { ok: false, message: "Escolha contas diferentes." };
    const { error } = await supabase.rpc("create_transfer", {
      p_workspace_id: v.workspaceId,
      p_from: v.fromAccountId,
      p_to: v.toAccountId,
      p_amount_cents: v.amount,
      p_date: v.dueDate,
      p_description: v.description,
      p_paid: paid,
    });
    if (error) return { ok: false, message: dbErrorMessage(error) };
  } else if ((v.installments ?? 1) > 1) {
    const { error } = await supabase.rpc("create_installments", {
      p_workspace_id: v.workspaceId,
      p_account_id: v.accountId,
      p_type: v.type,
      p_total_cents: v.amount,
      p_count: v.installments,
      p_first_date: v.dueDate,
      p_description: v.description,
      p_category_id: v.categoryId,
      p_contact_id: v.contactId,
      p_first_paid: paid,
    });
    if (error) return { ok: false, message: dbErrorMessage(error) };
    revalidate(v.workspaceId);
    return { ok: true, message: `Parcelamento em ${v.installments}x criado.` };
  } else {
    const { error } = await supabase.from("transactions").insert({
      workspace_id: v.workspaceId,
      account_id: v.accountId,
      type: v.type,
      direction: v.type === "income" ? 1 : -1,
      amount_cents: v.amount,
      description: v.description,
      notes: v.notes,
      due_date: v.dueDate,
      competence_date: v.competenceDate || v.dueDate,
      status: paid ? "paid" : "planned",
      paid_date: paid ? v.dueDate : null,
      category_id: v.categoryId,
      contact_id: v.contactId,
    });
    if (error) return { ok: false, message: dbErrorMessage(error) };
  }
  revalidate(v.workspaceId);
  return { ok: true, message: "Lançamento salvo." };
}

const updateSchema = txSchema.extend({
  id: uuid,
  status: z.enum(["planned", "paid", "cancelled"]),
  paidDate: isoDate.optional().or(z.literal("")),
  /** Estorno/crédito: despesa com sinal positivo. */
  refund: z.string().optional(),
});

export async function updateTransaction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = updateSchema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  const { supabase } = await getActionClient();
  const paidDate = v.status === "paid" ? v.paidDate || v.dueDate : null;
  const { error } = await supabase
    .from("transactions")
    .update({
      account_id: v.accountId,
      type: v.type,
      direction: v.type === "income" || v.refund === "on" ? 1 : -1,
      amount_cents: v.amount,
      description: v.description,
      notes: v.notes,
      due_date: v.dueDate,
      competence_date: v.competenceDate || v.dueDate,
      // Editar uma ocorrência de recorrência a desvincula (a regra não a sobrescreve mais)
      recurrence_detached: true,
      status: v.status,
      paid_date: paidDate,
      category_id: v.categoryId,
      contact_id: v.contactId,
    })
    .eq("id", v.id)
    .eq("workspace_id", v.workspaceId)
    .neq("type", "transfer");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidate(v.workspaceId);
  redirect(`/w/${v.workspaceId}/lancamentos?mes=${v.dueDate.slice(0, 7)}`);
}

const bulkSchema = z.object({
  workspaceId: uuid,
  op: z.enum(["pay", "unpay", "delete", "categorize"]),
  categoryId: optionalUuid,
  ids: z.array(uuid).min(1).max(500),
});

/** Ações em massa. Em transferências, a ação vale para o par inteiro. */
export async function bulkAction(form: FormData) {
  const parsed = bulkSchema.safeParse({ ...formObject(form), ids: form.getAll("ids") });
  if (!parsed.success) return;
  const v = parsed.data;
  const { supabase } = await getActionClient();

  const { data: rows } = await supabase
    .from("transactions")
    .select("id, transfer_group_id")
    .eq("workspace_id", v.workspaceId)
    .in("id", v.ids);
  const groups = [...new Set((rows ?? []).map((r) => r.transfer_group_id).filter(Boolean))] as string[];
  let ids = (rows ?? []).map((r) => r.id);
  if (groups.length) {
    const { data: pairs } = await supabase
      .from("transactions")
      .select("id")
      .eq("workspace_id", v.workspaceId)
      .in("transfer_group_id", groups);
    ids = [...new Set([...ids, ...(pairs ?? []).map((p) => p.id)])];
  }
  if (!ids.length) return;

  const tx = () => supabase.from("transactions");
  if (v.op === "pay") {
    await tx().update({ status: "paid", paid_date: todayISO() }).eq("workspace_id", v.workspaceId).in("id", ids).eq("status", "planned");
  } else if (v.op === "unpay") {
    await tx().update({ status: "planned", paid_date: null }).eq("workspace_id", v.workspaceId).in("id", ids);
  } else if (v.op === "delete") {
    await tx().update({ deleted_at: new Date().toISOString() }).eq("workspace_id", v.workspaceId).in("id", ids);
  } else if (v.op === "categorize") {
    await supabase
      .from("transactions")
      .update({ category_id: v.categoryId })
      .eq("workspace_id", v.workspaceId)
      .in("id", v.ids)
      .neq("type", "transfer");
  }
  revalidate(v.workspaceId);
}
