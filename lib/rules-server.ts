import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findRule, type CategorizationRule } from "@/lib/finance/rules";

export const RULE_SELECT =
  "id, name, priority, operator, pattern, direction, amount_min_cents, amount_max_cents, account_id, set_category_id, set_contact_id, set_tag_ids, active, times_applied";

type Row = {
  id: string;
  name: string;
  priority: number;
  operator: CategorizationRule["operator"];
  pattern: string;
  direction: CategorizationRule["direction"];
  amount_min_cents: number | null;
  amount_max_cents: number | null;
  account_id: string | null;
  set_category_id: string | null;
  set_contact_id: string | null;
  set_tag_ids: string[];
  active: boolean;
  times_applied: number;
};
export type RuleRecord = Row;

export function toRule(r: Row): CategorizationRule {
  return {
    id: r.id,
    priority: r.priority,
    operator: r.operator,
    pattern: r.pattern,
    direction: r.direction,
    amountMinCents: r.amount_min_cents,
    amountMaxCents: r.amount_max_cents,
    accountId: r.account_id,
    categoryId: r.set_category_id,
    contactId: r.set_contact_id,
    tagIds: r.set_tag_ids ?? [],
    active: r.active,
  };
}

export async function loadRules(supabase: SupabaseClient, workspaceId: string) {
  const { data } = await supabase.from("categorization_rules").select(RULE_SELECT).eq("workspace_id", workspaceId).eq("active", true);
  return ((data ?? []) as Row[]).map(toRule);
}

/**
 * Aplica as regras aos lançamentos existentes (não transferências).
 * onlyEmpty: só preenche o que está sem categoria/contato, sem sobrescrever escolhas manuais.
 */
export async function applyRulesToExisting(
  supabase: SupabaseClient,
  workspaceId: string,
  opts: { onlyEmpty: boolean; ruleIds?: string[] },
) {
  let rules = await loadRules(supabase, workspaceId);
  // Natureza da categoria: regra de despesa não categoriza receita (e vice-versa)
  const { data: cats } = await supabase.from("categories").select("id, kind").eq("workspace_id", workspaceId);
  const catKind = new Map((cats ?? []).map((c) => [c.id as string, c.kind as string]));
  if (opts.ruleIds) rules = rules.filter((r) => opts.ruleIds!.includes(r.id));
  if (!rules.length) return { updated: 0 };

  let updated = 0;
  const counts = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from("transactions")
      .select("id, account_id, description, statement_description, direction, amount_cents, category_id, contact_id, type")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .neq("type", "transfer")
      .order("id")
      .range(from, from + 999);
    if (opts.onlyEmpty) q = q.or("category_id.is.null,contact_id.is.null");
    const { data } = await q;
    if (!data?.length) break;

    // Agrupa por (regra, alteração) para atualizar em lote
    const batches = new Map<string, { ids: string[]; patch: Record<string, string> }>();
    const tagRows: { transaction_id: string; tag_id: string; workspace_id: string }[] = [];
    for (const t of data) {
      const rule = findRule(rules, {
        description: t.statement_description || t.description,
        amountCents: t.direction * t.amount_cents,
        accountId: t.account_id,
      });
      if (!rule) continue;
      const patch: Record<string, string> = {};
      const catOk = !rule.categoryId || catKind.get(rule.categoryId) === t.type;
      if (rule.categoryId && catOk && (!opts.onlyEmpty || !t.category_id) && t.category_id !== rule.categoryId) patch.category_id = rule.categoryId;
      if (rule.contactId && (!opts.onlyEmpty || !t.contact_id) && t.contact_id !== rule.contactId) patch.contact_id = rule.contactId;
      rule.tagIds.forEach((tag) => tagRows.push({ transaction_id: t.id, tag_id: tag, workspace_id: workspaceId }));
      if (!Object.keys(patch).length) continue;
      const key = `${rule.id}|${JSON.stringify(patch)}`;
      const b = batches.get(key) ?? { ids: [], patch };
      b.ids.push(t.id);
      batches.set(key, b);
      counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);
    }
    for (const b of batches.values()) {
      for (let i = 0; i < b.ids.length; i += 200) {
        const { error } = await supabase.from("transactions").update(b.patch).in("id", b.ids.slice(i, i + 200));
        if (!error) updated += Math.min(200, b.ids.length - i);
      }
    }
    if (tagRows.length) {
      await supabase.from("transaction_tags").upsert(tagRows, { onConflict: "transaction_id,tag_id", ignoreDuplicates: true });
    }
    if (data.length < 1000) break;
  }
  for (const [id, n] of counts) {
    const { data } = await supabase.from("categorization_rules").select("times_applied").eq("id", id).single();
    await supabase.from("categorization_rules").update({ times_applied: (data?.times_applied ?? 0) + n }).eq("id", id);
  }
  return { updated };
}
