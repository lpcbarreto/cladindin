"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionClient, type FormState } from "@/lib/actions";
import { addDays, shiftMonth, todayISO } from "@/lib/finance/dates";
import { generateRule, RULE_COLUMNS, type RuleRow } from "@/lib/recurrence-server";

// Lançamentos fictícios por mês: [dia, descrição, valor em centavos (− despesa), "Pai › Filha"]
const MONTHLY: [number, string, number, string][] = [
  [5, "SALARIO EMPRESA EXEMPLO LTDA", 650000, "Salário › Salário"],
  [6, "PIX ENVIADO IMOBILIARIA EXEMPLO", -180000, "Moradia › Aluguel"],
  [8, "SUPERMERCADO BOM PRECO", -54320, "Alimentação › Supermercado"],
  [10, "CONTA DE LUZ ENERGIA EXEMPLO", -18990, "Moradia › Energia"],
  [12, "UBER TRIP", -2790, "Transporte › Aplicativos"],
  [14, "RESTAURANTE SABOR CASEIRO", -8650, "Alimentação › Restaurantes"],
  [18, "FARMACIA SAUDE MAIS", -6420, "Saúde › Farmácia"],
  [21, "SUPERMERCADO BOM PRECO", -38710, "Alimentação › Supermercado"],
  [24, "POSTO COMBUSTIVEL EXEMPLO", -22000, "Transporte › Combustível"],
  [27, "UBER TRIP", -1980, "Transporte › Aplicativos"],
];

/** Popula um workspace vazio com dados fictícios para demonstração. */
export async function loadDemoData(_prev: FormState, form: FormData): Promise<FormState> {
  const ws = z.string().uuid().safeParse(form.get("workspaceId"));
  if (!ws.success) return { ok: false, message: "Workspace inválido." };
  const workspaceId = ws.data;
  const { supabase } = await getActionClient();

  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) return { ok: false, message: "Este workspace já tem lançamentos. Use um workspace novo para a demonstração." };

  const { data: cats } = await supabase.from("categories").select("id, name, parent_id").eq("workspace_id", workspaceId);
  const byId = new Map((cats ?? []).map((c) => [c.id, c]));
  const catId = (path: string) => {
    const [parent, child] = path.split(" › ");
    return (cats ?? []).find((c) => c.name === child && byId.get(c.parent_id ?? "")?.name === parent)?.id ?? null;
  };
  if (!catId("Moradia › Aluguel")) {
    return { ok: false, message: "As categorias padrão de pessoa física não foram encontradas neste workspace." };
  }

  const { data: bank, error: e1 } = await supabase
    .from("accounts")
    .insert({ workspace_id: workspaceId, name: "Conta Corrente Demo", type: "checking", initial_balance_cents: 250000, bank_code: "999" })
    .select("id")
    .single();
  const { data: card, error: e2 } = await supabase
    .from("accounts")
    .insert({ workspace_id: workspaceId, name: "Cartão Demo", type: "credit_card" })
    .select("id")
    .single();
  if (e1 || e2 || !bank || !card) return { ok: false, message: "Não foi possível criar as contas de demonstração." };
  await supabase.from("credit_cards").insert({
    account_id: card.id,
    workspace_id: workspaceId,
    limit_cents: 500000,
    closing_day: 3,
    due_day: 10,
    default_payment_account_id: bank.id,
  });

  const today = todayISO();
  const rows: Record<string, unknown>[] = [];
  for (let back = 2; back >= 0; back--) {
    const month = shiftMonth(today.slice(0, 7), -back);
    for (const [day, description, cents, cat] of MONTHLY) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      if (date > today) continue;
      rows.push({
        workspace_id: workspaceId,
        account_id: bank.id,
        type: cents > 0 ? "income" : "expense",
        direction: cents > 0 ? 1 : -1,
        amount_cents: Math.abs(cents),
        description,
        competence_date: date,
        due_date: date,
        paid_date: date,
        status: "paid",
        category_id: catId(cat),
      });
    }
    // Compras no cartão
    for (const [day, description, cents, cat] of [
      [9, "STREAMING EXEMPLO", 3990, "Lazer › Streaming"],
      [16, "LOJA ROUPAS EXEMPLO", 15990, "Compras › Vestuário"],
    ] as const) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      if (date > today) continue;
      rows.push({
        workspace_id: workspaceId,
        account_id: card.id,
        type: "expense",
        direction: -1,
        amount_cents: cents,
        description,
        competence_date: date,
        due_date: date,
        paid_date: date,
        status: "paid",
        category_id: catId(cat),
      });
    }
  }
  // Uma conta a pagar atrasada e uma a vencer
  rows.push(
    { workspace_id: workspaceId, account_id: bank.id, type: "expense", direction: -1, amount_cents: 12000, description: "CONDOMINIO EXEMPLO", competence_date: addDays(today, -3), due_date: addDays(today, -3), status: "planned", category_id: catId("Moradia › Condomínio") },
    { workspace_id: workspaceId, account_id: bank.id, type: "expense", direction: -1, amount_cents: 35000, description: "IPVA PARCELA EXEMPLO", competence_date: addDays(today, 5), due_date: addDays(today, 5), status: "planned", category_id: catId("Impostos e taxas › IPVA") },
  );
  const { error: e3 } = await supabase.from("transactions").insert(rows);
  if (e3) return { ok: false, message: "Não foi possível criar os lançamentos de demonstração." };

  const { data: rule } = await supabase
    .from("recurrence_rules")
    .insert({
      workspace_id: workspaceId,
      type: "expense",
      account_id: bank.id,
      amount_cents: 9990,
      description: "INTERNET FIBRA EXEMPLO",
      category_id: catId("Moradia › Internet"),
      frequency: "monthly",
      day: 15,
      start_date: today,
      weekend_adjust: "after",
    })
    .select(RULE_COLUMNS)
    .single();
  if (rule) await generateRule(supabase, rule as RuleRow);

  await supabase.from("categorization_rules").insert({
    workspace_id: workspaceId,
    name: "Uber",
    pattern: "UBER",
    direction: "out",
    set_category_id: catId("Transporte › Aplicativos"),
  });
  const food = (cats ?? []).find((c) => c.name === "Alimentação" && !c.parent_id);
  if (food) await supabase.from("budgets").insert({ workspace_id: workspaceId, category_id: food.id, amount_cents: 100000 });

  revalidatePath(`/w/${workspaceId}`, "layout");
  return { ok: true, message: `Pronto! ${rows.length} lançamentos, um cartão, uma recorrência, uma regra e um orçamento criados.` };
}
