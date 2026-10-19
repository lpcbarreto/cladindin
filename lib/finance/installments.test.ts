import { describe, expect, it } from "vitest";
import { detectInstallment, invoiceDatesForPurchase, splitInstallments } from "./installments";

describe("detectInstallment", () => {
  it.each([
    ["LOJA ELETRO EXEMPLO 03/10", 3, 10, "LOJA ELETRO EXEMPLO"],
    ["LOJA ELETRO EXEMPLO PARC 3/10", 3, 10, "LOJA ELETRO EXEMPLO"],
    ["Curso Online Parcela 02 de 12", 2, 12, "CURSO ONLINE"],
    ["Academia 1 de 3", 1, 3, "ACADEMIA"],
    ["MAGAZINE (5/6)", 5, 6, "MAGAZINE"],
  ])("%s", (desc, n, t, base) => {
    expect(detectInstallment(desc)).toEqual({ number: n, total: t, base });
  });

  it.each(["PADARIA 12/10/2026", "MERCADO 25/12", "UBER TRIP", "LOJA 11/10"])("não confunde data: %s", (desc) => {
    // 25/12 e 11/10 seriam parcela > total ou dia/mês; 12/10/2026 tem ano
    expect(detectInstallment(desc)).toBeNull();
  });

  it("usa a coluna de parcela quando existe", () => {
    expect(detectInstallment("NETSHOES", "2/4")).toMatchObject({ number: 2, total: 4, base: "NETSHOES" });
  });
});

describe("splitInstallments", () => {
  it("ajusta os centavos na última", () => {
    expect(splitInstallments(10000, 3)).toEqual([3333, 3333, 3334]);
    expect(splitInstallments(10000, 3).reduce((a, b) => a + b)).toBe(10000);
    expect(splitInstallments(5000, 1)).toEqual([5000]);
  });
  it("rejeita entradas inválidas", () => {
    expect(() => splitInstallments(0, 3)).toThrow();
    expect(() => splitInstallments(100, 0)).toThrow();
  });
});

describe("invoiceDatesForPurchase", () => {
  it("fecha dia 3, vence dia 10", () => {
    expect(invoiceDatesForPurchase(3, 10, "2026-10-02")).toEqual({ closingDate: "2026-10-03", dueDate: "2026-10-10" });
    // no dia do fechamento já vai para a próxima
    expect(invoiceDatesForPurchase(3, 10, "2026-10-03")).toEqual({ closingDate: "2026-11-03", dueDate: "2026-11-10" });
  });
  it("vencimento antes do fechamento cai no mês seguinte", () => {
    expect(invoiceDatesForPurchase(25, 5, "2026-10-20")).toEqual({ closingDate: "2026-10-25", dueDate: "2026-11-05" });
    expect(invoiceDatesForPurchase(25, 5, "2026-12-26")).toEqual({ closingDate: "2027-01-25", dueDate: "2027-02-05" });
  });
  it("dia 31 em mês curto", () => {
    expect(invoiceDatesForPurchase(31, 10, "2026-02-10")).toEqual({ closingDate: "2026-02-28", dueDate: "2026-03-10" });
  });
});
