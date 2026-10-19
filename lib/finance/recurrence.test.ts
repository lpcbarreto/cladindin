import { describe, expect, it } from "vitest";
import { adjustToBusinessDay, easter, holidays, isBusinessDay } from "./holidays";
import { describeRule, occurrences, type RecurrenceRule } from "./recurrence";

const rule = (p: Partial<RecurrenceRule>): RecurrenceRule => ({
  frequency: "monthly",
  interval: 1,
  dayMode: "fixed",
  day: 10,
  startDate: "2026-01-01",
  endMode: "never",
  untilDate: null,
  count: null,
  adjust: "none",
  ...p,
});

describe("feriados", () => {
  it("calcula a Páscoa e os móveis", () => {
    expect(easter(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    const h = holidays(2026);
    expect(h.has("2026-02-16")).toBe(true); // carnaval segunda
    expect(h.has("2026-02-17")).toBe(true); // carnaval terça
    expect(h.has("2026-04-03")).toBe(true); // sexta santa
    expect(h.has("2026-06-04")).toBe(true); // corpus christi
    expect(h.has("2026-11-20")).toBe(true);
  });
  it("dia útil e ajustes", () => {
    expect(isBusinessDay("2026-10-12")).toBe(false); // feriado
    expect(isBusinessDay("2026-10-13")).toBe(true);
    expect(adjustToBusinessDay("2026-10-10", "after")).toBe("2026-10-13"); // sáb → (seg 12 é feriado) → ter 13
    expect(adjustToBusinessDay("2026-10-10", "before")).toBe("2026-10-09");
  });
});

describe("occurrences", () => {
  it("mensal dia 10, primeira no mês seguinte se o início já passou do dia", () => {
    const r = rule({ startDate: "2026-10-19" });
    expect(occurrences(r, "2026-01-01", "2027-01-31").map((o) => o.date)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
  });

  it("dia 31 vira o último dia em meses curtos; 'último dia' também", () => {
    expect(occurrences(rule({ day: 31 }), "2026-01-01", "2026-04-30").map((o) => o.date)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(occurrences(rule({ dayMode: "last" }), "2028-02-01", "2028-02-29").map((o) => o.date)).toEqual(["2028-02-29"]);
  });

  it("N-ésimo dia útil pula fim de semana e feriado", () => {
    // Out/2026: 1 (qui), 2 (sex), 5 (seg)... 5º dia útil = 07/10
    expect(occurrences(rule({ dayMode: "business", day: 5 }), "2026-10-01", "2026-10-31").map((o) => o.date)).toEqual(["2026-10-07"]);
  });

  it("ajusta fim de semana mantendo a chave estável", () => {
    const [o] = occurrences(rule({ adjust: "after", startDate: "2026-10-01" }), "2026-10-01", "2026-10-31");
    expect(o).toEqual({ key: "2026-10-10", date: "2026-10-13", index: 0 });
  });

  it("término por quantidade e por data", () => {
    expect(occurrences(rule({ endMode: "count", count: 3, startDate: "2026-10-19" }), "2026-01-01", "2030-01-01")).toHaveLength(3);
    expect(occurrences(rule({ endMode: "until", untilDate: "2026-03-10" }), "2026-01-01", "2030-01-01")).toHaveLength(3);
  });

  it("semanal, quinzenal, a cada 2 meses e anual", () => {
    expect(occurrences(rule({ frequency: "weekly", startDate: "2026-10-05" }), "2026-10-01", "2026-10-31").map((o) => o.date)).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
    expect(occurrences(rule({ frequency: "biweekly", startDate: "2026-10-05" }), "2026-10-01", "2026-11-30")).toHaveLength(5);
    expect(occurrences(rule({ interval: 2 }), "2026-01-01", "2026-12-31").map((o) => o.date.slice(5, 7))).toEqual(["01", "03", "05", "07", "09", "11"]);
    expect(occurrences(rule({ frequency: "yearly", day: 15, startDate: "2026-03-01" }), "2026-01-01", "2028-12-31").map((o) => o.date)).toEqual([
      "2026-03-15",
      "2027-03-15",
      "2028-03-15",
    ]);
  });

  it("descreve a regra", () => {
    expect(describeRule(rule({}))).toBe("Mensal, dia 10");
    expect(describeRule(rule({ dayMode: "business", day: 5 }))).toBe("Mensal, 5º dia útil");
    expect(describeRule(rule({ frequency: "weekly", interval: 2 }))).toBe("A cada 2 semanas");
  });
});
