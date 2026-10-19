"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorMessage, firstIssue, formObject, getActionClient, isoDate, optionalUuid, uuid, type FormState } from "@/lib/actions";
import { parseMoneyToCents } from "@/lib/finance/money";
import { addDays, todayISO } from "@/lib/finance/dates";
import { clearFuture, generateRule, RULE_COLUMNS, type RuleRow } from "@/lib/recurrence-server";

const ruleSchema = z
  .object({
    workspaceId: uuid,
    type: z.enum(["income", "expense", "transfer"]),
    accountId: uuid,
    toAccountId: optionalUuid,
    description: z.string().trim().min(1, "Informe a descrição").max(200),
    amount: z.string().transform((v, ctx) => {
      try {
        const c = Math.abs(parseMoneyToCents(v));
        if (!c) throw new Error();
        return c;
      } catch {
        ctx.addIssue({ code: "custom", message: "Informe um valor maior que zero" });
        return z.NEVER;
      }
    }),
    variable: z.string().optional(),
    categoryId: optionalUuid,
    contactId: optionalUuid,
    frequency: z.enum(["daily", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "yearly"]),
    interval: z.coerce.number().int().min(1).max(36),
    dayMode: z.enum(["fixed", "last", "business"]),
    day: z.coerce.number().int().min(1, "Dia inválido").max(31, "Dia inválido"),
    startDate: isoDate,
    endMode: z.enum(["never", "until", "count"]),
    untilDate: isoDate.optional().or(z.literal("")),
    count: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
    adjust: z.enum(["none", "before", "after"]),
  })
  .superRefine((v, ctx) => {
    if (v.type === "transfer" && (!v.toAccountId || v.toAccountId === v.accountId)) {
      ctx.addIssue({ code: "custom", message: "Escolha a conta de destino da transferência" });
    }
    if (v.endMode === "until" && !v.untilDate) ctx.addIssue({ code: "custom", message: "Informe a data de término" });
    if (v.endMode === "count" && !v.count) ctx.addIssue({ code: "custom", message: "Informe a quantidade de ocorrências" });
  });

type RuleInput = z.infer<typeof ruleSchema>;

function toRow(v: RuleInput) {
  return {
    workspace_id: v.workspaceId,
    type: v.type,
    account_id: v.accountId,
    to_account_id: v.type === "transfer" ? v.toAccountId : null,
    amount_cents: v.amount,
    variable_amount: v.variable === "on",
    description: v.description,
    category_id: v.type === "transfer" ? null : v.categoryId,
    contact_id: v.type === "transfer" ? null : v.contactId,
    frequency: v.frequency,
    interval_count: v.interval,
    day_mode: v.dayMode,
    day: v.day,
    start_date: v.startDate,
    end_mode: v.endMode,
    until_date: v.endMode === "until" ? v.untilDate || null : null,
    occurrence_count: v.endMode === "count" ? (v.count ?? null) : null,
    weekend_adjust: v.adjust,
  };
}

export async function createRule(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = ruleSchema.safeParse(formObject(form));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { supabase } = await getActionClient();
  const { data, error } = await supabase.from("recurrence_rules").insert(toRow(parsed.data)).select(RULE_COLUMNS).single();
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const { created } = await generateRule(supabase, data as RuleRow);
  revalidatePath(`/w/${parsed.data.workspaceId}`, "layout");
  return { ok: true, message: `Recorrência criada com ${created} lançamento(s) previsto(s).` };
}

/**
 * Editar "todas": atualiza a regra e refaz os previstos futuros (de hoje em diante).
 * Editar "a partir de": encerra a regra antiga na véspera e cria uma nova regra com os novos dados.
 * "Somente esta" é editar o próprio lançamento (ele fica desvinculado da regra).
 */
export async function updateRule(_prev: FormState, form: FormData): Promise<FormState> {
  const obj = formObject(form);
  const parsed = ruleSchema.safeParse(obj);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const meta = z
    .object({ id: uuid, scope: z.enum(["all", "from"]), fromDate: isoDate.optional().or(z.literal("")) })
    .safeParse(obj);
  if (!meta.success) return { ok: false, message: "Dados inválidos." };
  const v = parsed.data;
  const { id, scope } = meta.data;
  const { supabase } = await getActionClient();
  const today = todayISO();

  if (scope === "all") {
    await clearFuture(supabase, id, today);
    const { data, error } = await supabase
      .from("recurrence_rules")
      .update({ ...toRow(v), generated_until: addDays(today, -1) })
      .eq("id", id)
      .eq("workspace_id", v.workspaceId)
      .select(RULE_COLUMNS)
      .single();
    if (error) return { ok: false, message: dbErrorMessage(error) };
    await generateRule(supabase, data as RuleRow);
  } else {
    const fromDate = meta.data.fromDate || today;
    await clearFuture(supabase, id, fromDate);
    const { error: endErr } = await supabase
      .from("recurrence_rules")
      .update({ end_mode: "until", until_date: addDays(fromDate, -1), occurrence_count: null, status: "ended" })
      .eq("id", id)
      .eq("workspace_id", v.workspaceId);
    if (endErr) return { ok: false, message: dbErrorMessage(endErr) };
    const { data, error } = await supabase
      .from("recurrence_rules")
      .insert({ ...toRow(v), start_date: fromDate > v.startDate ? fromDate : v.startDate })
      .select(RULE_COLUMNS)
      .single();
    if (error) return { ok: false, message: dbErrorMessage(error) };
    await generateRule(supabase, data as RuleRow);
  }
  revalidatePath(`/w/${v.workspaceId}`, "layout");
  redirect(`/w/${v.workspaceId}/recorrencias`);
}

const statusSchema = z.object({ workspaceId: uuid, id: uuid, op: z.enum(["pause", "resume", "end", "delete"]) });

export async function changeRuleStatus(form: FormData) {
  const v = statusSchema.parse(formObject(form));
  const { supabase } = await getActionClient();
  const today = todayISO();

  if (v.op === "pause") {
    await clearFuture(supabase, v.id, today);
    await supabase.from("recurrence_rules").update({ status: "paused", generated_until: addDays(today, -1) }).eq("id", v.id).eq("workspace_id", v.workspaceId);
  } else if (v.op === "resume") {
    const { data } = await supabase
      .from("recurrence_rules")
      .update({ status: "active", generated_until: addDays(today, -1) })
      .eq("id", v.id)
      .eq("workspace_id", v.workspaceId)
      .select(RULE_COLUMNS)
      .single();
    if (data) await generateRule(supabase, data as RuleRow);
  } else if (v.op === "end") {
    await clearFuture(supabase, v.id, addDays(today, 1));
    await supabase
      .from("recurrence_rules")
      .update({ status: "ended", end_mode: "until", until_date: today, occurrence_count: null })
      .eq("id", v.id)
      .eq("workspace_id", v.workspaceId);
  } else {
    await clearFuture(supabase, v.id, today);
    await supabase.from("recurrence_rules").delete().eq("id", v.id).eq("workspace_id", v.workspaceId);
  }
  revalidatePath(`/w/${v.workspaceId}`, "layout");
}
