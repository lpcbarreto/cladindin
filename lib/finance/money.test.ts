import { describe, expect, it } from "vitest";
import { formatBRL, parseMoneyToCents } from "./money";

describe("parseMoneyToCents", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234.56", 123456],
    ["-R$ 10,00", -1000],
    ["(10,00)", -1000],
    ["10,5", 1050],
    ["1.234", 123400],
    ["0,005", 1],
    ["+55,90", 5590],
    ["12,30-", -1230],
    ["1,234.56", 123456],
  ])("%s → %d", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it("rejeita lixo", () => {
    expect(() => parseMoneyToCents("abc")).toThrow();
    expect(() => parseMoneyToCents("")).toThrow();
  });
});

describe("formatBRL", () => {
  it("formata em pt-BR", () => {
    expect(formatBRL(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
});
