import { describe, expect, it } from "vitest";
import { findRule, isValidRegex, ruleMatches, suggestPattern, type CategorizationRule } from "./rules";

const rule = (p: Partial<CategorizationRule>): CategorizationRule => ({
  id: "r",
  priority: 100,
  operator: "contains",
  pattern: "",
  direction: "any",
  amountMinCents: null,
  amountMaxCents: null,
  accountId: null,
  categoryId: "cat",
  contactId: null,
  tagIds: [],
  active: true,
  ...p,
});
const t = (description: string, amountCents = -1000, accountId = "a") => ({ description, amountCents, accountId });

describe("ruleMatches", () => {
  it("contém, ignorando acentos e maiúsculas", () => {
    expect(ruleMatches(rule({ pattern: "padaria" }), t("COMPRA CARTAO PADARIA SÃO JOÃO"))).toBe(true);
    expect(ruleMatches(rule({ pattern: "sao joao" }), t("Padaria São João"))).toBe(true);
    expect(ruleMatches(rule({ pattern: "mercado" }), t("PADARIA"))).toBe(false);
  });
  it("começa com usa também a descrição sem prefixos do banco", () => {
    expect(ruleMatches(rule({ operator: "starts_with", pattern: "uber" }), t("COMPRA CARTAO UBER TRIP"))).toBe(true);
    expect(ruleMatches(rule({ operator: "starts_with", pattern: "trip" }), t("UBER TRIP"))).toBe(false);
  });
  it("igual e regex (inválida nunca casa)", () => {
    expect(ruleMatches(rule({ operator: "equals", pattern: "netflix com" }), t("NETFLIX.COM"))).toBe(true);
    expect(ruleMatches(rule({ operator: "regex", pattern: "^(ifood|rappi)" }), t("IFOOD *RESTAURANTE"))).toBe(true);
    expect(ruleMatches(rule({ operator: "regex", pattern: "([" }), t("x"))).toBe(false);
    expect(isValidRegex("([")).toBe(false);
  });
  it("faixa de valor, sentido e conta", () => {
    const r = rule({ pattern: "pix", amountMinCents: 1000, amountMaxCents: 5000, direction: "out", accountId: "a" });
    expect(ruleMatches(r, t("PIX ENVIADO", -3000))).toBe(true);
    expect(ruleMatches(r, t("PIX ENVIADO", -6000))).toBe(false);
    expect(ruleMatches(r, t("PIX RECEBIDO", 3000))).toBe(false);
    expect(ruleMatches(r, t("PIX ENVIADO", -3000, "b"))).toBe(false);
  });
  it("inativa não casa", () => {
    expect(ruleMatches(rule({ pattern: "x", active: false }), t("x"))).toBe(false);
  });
});

describe("findRule", () => {
  it("respeita prioridade e depois o padrão mais específico", () => {
    const a = rule({ id: "a", pattern: "uber" });
    const b = rule({ id: "b", pattern: "uber eats" });
    const c = rule({ id: "c", pattern: "uber", priority: 1 });
    expect(findRule([a, b], t("UBER EATS PEDIDO"))?.id).toBe("b");
    expect(findRule([a, b, c], t("UBER EATS PEDIDO"))?.id).toBe("c");
    expect(findRule([a], t("PADARIA"))).toBeNull();
  });
});

describe("suggestPattern", () => {
  it("usa as primeiras palavras sem prefixos/códigos", () => {
    expect(suggestPattern("COMPRA CARTAO DEB PADARIA EXEMPLO CENTRO 12/10")).toBe("PADARIA EXEMPLO CENTRO");
  });
});
