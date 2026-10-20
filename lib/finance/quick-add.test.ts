import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quick-add";

const accounts = [
  { id: "a1", name: "Nubank" },
  { id: "a2", name: "Itaú Corrente" },
];
const today = "2026-10-20";

describe("parseQuickAdd", () => {
  it("lê descrição, valor e conta", () => {
    expect(parseQuickAdd("mercado 120 nubank", accounts, today)).toEqual({
      description: "Mercado",
      amountCents: 12000,
      type: "expense",
      accountId: "a1",
      date: today,
    });
  });
  it("reconhece receita, centavos e acento", () => {
    const r = parseQuickAdd("+3.500,50 salário itau", accounts, today);
    expect(r).toMatchObject({ amountCents: 350050, type: "income", accountId: "a2", description: "Salário" });
  });
  it("entende ontem e datas dd/mm", () => {
    expect(parseQuickAdd("uber 23,90 ontem", accounts, today).date).toBe("2026-10-19");
    expect(parseQuickAdd("luz 180 05/11", accounts, today).date).toBe("2026-11-05");
  });
  it("sem valor devolve null", () => {
    expect(parseQuickAdd("padaria", accounts, today).amountCents).toBeNull();
  });
  it("ignora data inválida", () => {
    expect(parseQuickAdd("x 10 31/02", accounts, today).date).toBe(today);
  });
});
