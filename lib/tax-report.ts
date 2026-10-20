import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Grupos que costumam ser dedutíveis ou informados na declaração (pessoa física)
const DEDUCTIBLE = /sa[uú]de|m[eé]dic|consult|plano|odonto|dentist|hospital|psic|educa[cç][aã]o|escola|faculdade|mensalidade|previd|pgbl|pens[aã]o/i;

type Row = {
  type: "income" | "expense";
  direction: number;
  amount_cents: number;
  category: { name: string; parent: { name: string } | null } | null;
  contact: { id: string; name: string; document: string | null } | null;
};

/** Resumo anual para o Imposto de Renda: rendimentos, despesas dedutíveis e pagamentos por CPF/CNPJ. */
export async function loadTaxReport(supabase: SupabaseClient, workspaceId: string, year: number) {
  const { data, error } = await supabase
    .from("transactions")
    .select("type, direction, amount_cents, category:categories!category_id(name, parent:parent_id(name)), contact:contacts!contact_id(id, name, document)")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .eq("status", "paid")
    .in("type", ["income", "expense"])
    .gte("paid_date", `${year}-01-01`)
    .lte("paid_date", `${year}-12-31`)
    .limit(20000);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];

  const incomeByCat = new Map<string, number>();
  const deductible = new Map<string, number>();
  const byContact = new Map<string, { name: string; document: string | null; income: number; expense: number }>();
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    const value = r.type === "income" ? r.direction * r.amount_cents : -r.direction * r.amount_cents;
    const group = r.category ? (r.category.parent?.name ?? r.category.name) : "Sem categoria";
    const full = r.category ? (r.category.parent ? `${r.category.parent.name} › ${r.category.name}` : r.category.name) : "Sem categoria";
    if (r.type === "income") {
      income += value;
      incomeByCat.set(group, (incomeByCat.get(group) ?? 0) + value);
    } else {
      expense += value;
      if (DEDUCTIBLE.test(full)) deductible.set(full, (deductible.get(full) ?? 0) + value);
    }
    if (r.contact?.document) {
      const c = byContact.get(r.contact.id) ?? { name: r.contact.name, document: r.contact.document, income: 0, expense: 0 };
      if (r.type === "income") c.income += value;
      else c.expense += value;
      byContact.set(r.contact.id, c);
    }
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  return {
    income,
    expense,
    incomeByCategory: sorted(incomeByCat),
    deductible: sorted(deductible),
    deductibleTotal: [...deductible.values()].reduce((a, b) => a + b, 0),
    contacts: [...byContact.values()].sort((a, b) => b.expense + b.income - (a.expense + a.income)),
  };
}
