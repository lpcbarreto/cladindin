import { describe, expect, it } from "vitest";
import { balanceSeries, categoryByMonth, dre, groupBy, monthlyFlow, monthsBetween, type ReportTx } from "./reports";

const tx = (p: Partial<ReportTx>): ReportTx => ({
  type: "expense",
  direction: -1,
  amount_cents: 1000,
  status: "paid",
  competence_date: "2026-10-05",
  due_date: "2026-10-05",
  paid_date: "2026-10-05",
  category: null,
  contact: null,
  cost_center: null,
  ...p,
});
const cat = (name: string, parent?: string) => ({ name, parent: parent ? { name: parent } : null });

describe("monthsBetween", () => {
  it("atravessa o ano", () => expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]));
});

describe("monthlyFlow", () => {
  const txs = [
    tx({ type: "income", direction: 1, amount_cents: 500000 }),
    tx({ amount_cents: 120000 }),
    tx({ amount_cents: 30000, direction: 1 }), // estorno reduz a despesa
    tx({ amount_cents: 80000, status: "planned", paid_date: null, due_date: "2026-11-10", competence_date: "2026-10-20" }),
    tx({ amount_cents: 99999, status: "cancelled" }),
  ];
  it("competência: realizado x previsto", () => {
    const [oct, nov] = monthlyFlow(txs, ["2026-10", "2026-11"], "competencia");
    expect(oct).toMatchObject({ income: 500000, expense: 90000, net: 410000, expensePlanned: 170000, netPlanned: 330000 });
    expect(nov.expensePlanned).toBe(0);
  });
  it("caixa: previsto entra no mês do vencimento", () => {
    const [oct, nov] = monthlyFlow(txs, ["2026-10", "2026-11"], "caixa");
    expect(oct.expensePlanned).toBe(90000);
    expect(nov.expensePlanned).toBe(80000);
  });
});

describe("groupBy / categoryByMonth", () => {
  const txs = [
    tx({ amount_cents: 30000, category: cat("Supermercado", "Alimentação") }),
    tx({ amount_cents: 10000, category: cat("Restaurantes", "Alimentação") }),
    tx({ amount_cents: 20000, category: cat("Moradia") }),
    tx({ amount_cents: 5000 }),
    tx({ amount_cents: 9999, status: "planned" }),
  ];
  it("agrupa pela categoria principal com filhas e participação", () => {
    const g = groupBy(txs, "expense", "categoria");
    expect(g.map((r) => [r.name, r.total])).toEqual([
      ["Alimentação", 40000],
      ["Moradia", 20000],
      ["Sem categoria", 5000],
    ]);
    expect(g[0].children[0]).toEqual({ name: "Supermercado", total: 30000 });
    expect(g[0].share).toBeCloseTo(40000 / 65000);
  });
  it("matriz por mês", () => {
    const m = categoryByMonth([...txs, tx({ amount_cents: 7000, paid_date: "2026-09-02", competence_date: "2026-09-02", category: cat("Moradia") })], ["2026-09", "2026-10"], "expense", "caixa");
    expect(m.find((r) => r.name === "Moradia")?.values).toEqual([7000, 20000]);
  });
});

describe("dre", () => {
  it("monta o DRE simplificado pelas categorias PJ", () => {
    const rows = dre([
      tx({ type: "income", direction: 1, amount_cents: 1000000, category: cat("Prestação de serviços", "Receita operacional") }),
      tx({ amount_cents: 60000, category: cat("Simples Nacional", "Impostos") }),
      tx({ amount_cents: 200000, category: cat("Fornecedores", "Custos") }),
      tx({ amount_cents: 300000, category: cat("Pró-labore", "Despesas com pessoal") }),
      tx({ amount_cents: 5000, category: cat("Tarifas bancárias", "Despesas financeiras") }),
      tx({ type: "income", direction: 1, amount_cents: 2000, category: cat("Rendimentos", "Receitas financeiras") }),
    ]);
    const v = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(v["Receita líquida"]).toBe(940000);
    expect(v["Lucro bruto"]).toBe(740000);
    expect(v["Resultado operacional"]).toBe(440000);
    expect(v["(+/−) Resultado financeiro"]).toBe(-3000);
    expect(v["Resultado do período"]).toBe(437000);
  });
});

describe("balanceSeries", () => {
  it("acumula por dia", () => {
    expect(balanceSeries(1000, [{ date: "2026-10-02", amount: -300 }, { date: "2026-10-02", amount: 50 }], "2026-10-01", "2026-10-03")).toEqual([
      { date: "2026-10-01", balance: 1000 },
      { date: "2026-10-02", balance: 750 },
      { date: "2026-10-03", balance: 750 },
    ]);
  });
});
