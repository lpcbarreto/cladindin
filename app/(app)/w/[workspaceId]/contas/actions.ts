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

const deleteSchema = z.object({ workspaceId: uuid, id: uuid, confirmName: z.string() });

/**
 * Exclui a conta de vez, com todos os lançamentos, comprovantes, faturas, importações e recorrências dela.
 * Transferências levam junto o outro lado (na outra conta), para não sobrar meia transferência.
 */
export async function deleteAccount(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = deleteSchema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: "Dados inválidos." };
  const v = parsed.data;
  const { supabase, user } = await getActionClient();

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", v.workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || !["owner", "admin"].includes(member.role)) return { ok: false, message: "Só administradores podem excluir contas." };

  const { data: account } = await supabase.from("accounts").select("id, name").eq("id", v.id).eq("workspace_id", v.workspaceId).maybeSingle();
  if (!account) return { ok: false, message: "Conta não encontrada." };
  if (v.confirmName.trim() !== account.name) return { ok: false, message: `Digite exatamente “${account.name}” para confirmar.` };

  // Lançamentos da conta + o outro lado das transferências
  const { data: own } = await supabase.from("transactions").select("id, transfer_group_id").eq("workspace_id", v.workspaceId).eq("account_id", v.id);
  const groups = [...new Set((own ?? []).map((t) => t.transfer_group_id).filter(Boolean))] as string[];
  let ids = (own ?? []).map((t) => t.id);
  if (groups.length) {
    const { data: pairs } = await supabase.from("transactions").select("id").eq("workspace_id", v.workspaceId).in("transfer_group_id", groups);
    ids = [...new Set([...ids, ...(pairs ?? []).map((p) => p.id)])];
  }

  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    // Arquivos dos comprovantes no storage (as linhas saem em cascata com o lançamento)
    const { data: files } = await supabase.from("attachments").select("storage_path").in("transaction_id", chunk);
    if (files?.length) await supabase.storage.from("comprovantes").remove(files.map((f) => f.storage_path));
    const { error } = await supabase.from("transactions").delete().eq("workspace_id", v.workspaceId).in("id", chunk);
    if (error) return { ok: false, message: dbErrorMessage(error) };
  }

  // Faturas, importações, vínculos, modelos, regras e recorrências saem em cascata com a conta
  const { error } = await supabase.from("accounts").delete().eq("id", v.id).eq("workspace_id", v.workspaceId);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/w/${v.workspaceId}`, "layout");
  return { ok: true, message: `Conta “${account.name}” excluída com ${ids.length} lançamento(s).` };
}
