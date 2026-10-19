import { describe, expect, it } from "vitest";
import { budgetStatus, buildBudget } from "./budget";

const cats = [
  { id: "ali", name: "Alimentação", parent_id: null, kind: "expense" },
  { id: "sup", name: "Supermercado", parent_id: "ali", kind: "expense" },
  { id: "laz", name: "Lazer", parent_id: null, kind: "expense" },
  { id: "sal", name: "Salário", parent_id: null, kind: "income" },
];

describe("buildBudget", () => {
  it("soma subcategorias na principal e o específico do mês vence o padrão", () => {
    const rows = buildBudget(
      cats,
      [
        { category_id: "ali", month: null, amount_cents: 100000 },
        { category_id: "ali", month: "2026-12-01", amount_cents: 150000 },
        { category_id: "laz", month: null, amount_cents: 20000 },
      ],
      [
        { category_id: "sup", status: "paid", signed: -60000 },
        { category_id: "ali", status: "planned", signed: -10000 },
        { category_id: "sup", status: "paid", signed: 5000 }, // estorno
        { category_id: "laz", status: "cancelled", signed: -99999 },
      ],
      "2026-12",
    );
    const ali = rows.find((r) => r.categoryId === "ali")!;
    expect(ali).toMatchObject({ budget: 150000, isDefault: false, spent: 55000, planned: 10000 });
    expect(rows.find((r) => r.categoryId === "laz")).toMatchObject({ budget: 20000, isDefault: true, spent: 0 });
    expect(rows.some((r) => r.categoryId === "sal")).toBe(false);
  });
});

describe("budgetStatus", () => {
  it.each([
    [{ budget: null, spent: 10, planned: 0 }, "none"],
    [{ budget: 1000, spent: 500, planned: 0 }, "ok"],
    [{ budget: 1000, spent: 700, planned: 150 }, "attention"],
    [{ budget: 1000, spent: 900, planned: 200 }, "over"],
  ] as const)("%o → %s", (row, expected) => expect(budgetStatus(row)).toBe(expected));
});
