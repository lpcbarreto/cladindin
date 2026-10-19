"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, firstIssue, formObject, getActionClient, optionalText, optionalUuid, uuid, type FormState } from "@/lib/actions";
import { parseMoneyToCents } from "@/lib/finance/money";
import { isValidRegex } from "@/lib/finance/rules";
import { applyRulesToExisting } from "@/lib/rules-server";

const optionalMoney = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v?.trim()) return null;
    try {
      return Math.abs(parseMoneyToCents(v));
    } catch {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
  });

const ruleSchema = z
  .object({
    workspaceId: uuid,
    name: optionalText,
    operator: z.enum(["contains", "starts_with", "equals", "regex"]),
    pattern: z.string().trim().min(1, "Informe o texto da regra").max(200),
    direction: z.enum(["any", "in", "out"]),
    amountMin: optionalMoney,
    amountMax: optionalMoney,
    accountId: optionalUuid,
    categoryId: optionalUuid,
    contactId: optionalUuid,
    priority: z.coerce.number().int().min(0).max(1000).catch(100),
    applyNow: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.operator === "regex" && !isValidRegex(v.pattern)) ctx.addIssue({ code: "custom", message: "Expressão regular inválida" });
    if (!v.categoryId && !v.contactId) ctx.addIssue({ code: "custom", message: "Escolha a categoria ou o contato a definir" });
    if (v.amountMin !== null && v.amountMax !== null && v.amountMin > v.amountMax) {
      ctx.addIssue({ code: "custom", message: "Valor mínimo maior que o máximo" });
    }
  });

export async function createCategorizationRule(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = ruleSchema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  const { supabase } = await getActionClient();
  const { data, error } = await supabase
    .from("categorization_rules")
    .insert({
      workspace_id: v.workspaceId,
      name: v.name ?? v.pattern.slice(0, 80),
      priority: v.priority,
      operator: v.operator,
      pattern: v.pattern,
      direction: v.direction,
      amount_min_cents: v.amountMin,
      amount_max_cents: v.amountMax,
      account_id: v.accountId,
      set_category_id: v.categoryId,
      set_contact_id: v.contactId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: dbErrorMessage(error) };

  let msg = "Regra criada.";
  if (v.applyNow === "on") {
    const { updated } = await applyRulesToExisting(supabase, v.workspaceId, { onlyEmpty: true, ruleIds: [data.id] });
    msg += ` Aplicada a ${updated} lançamento(s) sem categoria.`;
  }
  revalidatePath(`/w/${v.workspaceId}`, "layout");
  return { ok: true, message: msg };
}

const idSchema = z.object({ workspaceId: uuid, id: uuid });

export async function toggleRule(form: FormData) {
  const v = idSchema.extend({ active: z.enum(["true", "false"]) }).parse(formObject(form));
  const { supabase } = await getActionClient();
  await supabase.from("categorization_rules").update({ active: v.active === "true" }).eq("id", v.id).eq("workspace_id", v.workspaceId);
  revalidatePath(`/w/${v.workspaceId}/regras`);
}

export async function deleteRule(form: FormData) {
  const v = idSchema.parse(formObject(form));
  const { supabase } = await getActionClient();
  await supabase.from("categorization_rules").delete().eq("id", v.id).eq("workspace_id", v.workspaceId);
  revalidatePath(`/w/${v.workspaceId}/regras`);
}

export async function reapplyRules(_prev: FormState, form: FormData): Promise<FormState> {
  const v = z.object({ workspaceId: uuid, mode: z.enum(["empty", "all"]) }).safeParse(formObject(form));
  if (!v.success) return { ok: false, message: "Dados inválidos." };
  const { supabase } = await getActionClient();
  const { updated } = await applyRulesToExisting(supabase, v.data.workspaceId, { onlyEmpty: v.data.mode === "empty" });
  revalidatePath(`/w/${v.data.workspaceId}`, "layout");
  return { ok: true, message: `${updated} lançamento(s) atualizado(s).` };
}
