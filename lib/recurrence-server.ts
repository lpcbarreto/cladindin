import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { occurrences, type RecurrenceRule } from "@/lib/finance/recurrence";
import { addDays, todayISO } from "@/lib/finance/dates";

export type RuleRow = {
  id: string;
  workspace_id: string;
  type: "income" | "expense" | "transfer";
  account_id: string;
  to_account_id: string | null;
  amount_cents: number;
  variable_amount: boolean;
  description: string;
  category_id: string | null;
  contact_id: string | null;
  frequency: RecurrenceRule["frequency"];
  interval_count: number;
  day_mode: RecurrenceRule["dayMode"];
  day: number;
  start_date: string;
  end_mode: RecurrenceRule["endMode"];
  until_date: string | null;
  occurrence_count: number | null;
  weekend_adjust: RecurrenceRule["adjust"];
  horizon_months: number;
  status: "active" | "paused" | "ended";
  generated_until: string | null;
};

export const RULE_COLUMNS =
  "id, workspace_id, type, account_id, to_account_id, amount_cents, variable_amount, description, category_id, contact_id, frequency, interval_count, day_mode, day, start_date, end_mode, until_date, occurrence_count, weekend_adjust, horizon_months, status, generated_until";

export function toRule(r: RuleRow): RecurrenceRule {
  return {
    frequency: r.frequency,
    interval: r.interval_count,
    dayMode: r.day_mode,
    day: r.day,
    startDate: r.start_date,
    endMode: r.end_mode,
    untilDate: r.until_date,
    count: r.occurrence_count,
    adjust: r.weekend_adjust,
  };
}

function addMonths(iso: string, months: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Materializa as ocorrências da regra como lançamentos "previstos" até o horizonte.
 * Idempotente: o índice único (recurrence_id, recurrence_date, direction) ignora repetidos,
 * inclusive ocorrências que o usuário excluiu.
 */
export async function generateRule(supabase: SupabaseClient, rule: RuleRow, today = todayISO()) {
  if (rule.status !== "active") return { created: 0 };
  const horizon = addMonths(today, rule.horizon_months);
  const from = rule.generated_until ? addDays(rule.generated_until, 1) : rule.start_date;
  if (from > horizon) return { created: 0 };

  const occ = occurrences(toRule(rule), from, horizon);
  const base = {
    workspace_id: rule.workspace_id,
    amount_cents: rule.amount_cents,
    description: rule.description,
    notes: rule.variable_amount ? "Valor estimado (recorrência)" : null,
    status: "planned" as const,
    origin: "recurrence" as const,
    recurrence_id: rule.id,
  };
  const rows = occ.flatMap((o): Record<string, unknown>[] => {
    const dates = { recurrence_date: o.key, due_date: o.date, competence_date: o.date };
    if (rule.type === "transfer") {
      const g = randomUUID();
      return [
        { ...base, ...dates, type: "transfer", direction: -1, account_id: rule.account_id, transfer_group_id: g },
        { ...base, ...dates, type: "transfer", direction: 1, account_id: rule.to_account_id, transfer_group_id: g },
      ];
    }
    return [
      {
        ...base,
        ...dates,
        type: rule.type,
        direction: rule.type === "income" ? 1 : -1,
        account_id: rule.account_id,
        category_id: rule.category_id,
        contact_id: rule.contact_id,
      },
    ];
  });

  let created = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await supabase
      .from("transactions")
      .upsert(rows.slice(i, i + 500), { onConflict: "recurrence_id,recurrence_date,direction", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Falha ao gerar recorrência: ${error.message}`);
    created += data?.length ?? 0;
  }
  await supabase.from("recurrence_rules").update({ generated_until: horizon }).eq("id", rule.id);
  return { created };
}

/** Remove (de fato) os previstos gerados e não editados a partir de uma data. */
export async function clearFuture(supabase: SupabaseClient, ruleId: string, fromDate: string) {
  await supabase
    .from("transactions")
    .delete()
    .eq("recurrence_id", ruleId)
    .eq("status", "planned")
    .eq("recurrence_detached", false)
    // Ocorrências que o usuário excluiu ficam: o índice único impede que a regra as recrie
    .is("deleted_at", null)
    .gte("due_date", fromDate);
}

/** Mantém a janela abastecida para as regras ativas de um workspace (chamado ao abrir as telas). */
export async function topUpWorkspace(supabase: SupabaseClient, workspaceId: string, today = todayISO()) {
  const threshold = addMonths(today, 11);
  const { data } = await supabase
    .from("recurrence_rules")
    .select(RULE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .or(`generated_until.is.null,generated_until.lt.${threshold}`);
  for (const r of (data ?? []) as RuleRow[]) await generateRule(supabase, r, today);
}
