import { describe, expect, it } from "vitest";
import { goalPlan, monthsUntil } from "./goals";

describe("metas", () => {
  it("conta os meses até a data", () => {
    expect(monthsUntil("2026-10-20", "2026-12-31")).toBe(3);
    expect(monthsUntil("2026-10-20", "2026-12-10")).toBe(2);
    expect(monthsUntil("2026-10-20", "2026-10-25")).toBe(1);
  });
  it("calcula quanto guardar por mês", () => {
    expect(goalPlan(100000, 500000, "2026-12-31", "2026-10-20")).toEqual({ remaining: 400000, percent: 20, perMonth: 133334, done: false, late: false });
  });
  it("meta cumprida e meta atrasada", () => {
    expect(goalPlan(600000, 500000, "2026-12-31", "2026-10-20")).toMatchObject({ done: true, percent: 100, perMonth: null });
    expect(goalPlan(0, 1000, "2026-01-01", "2026-10-20")).toMatchObject({ late: true, perMonth: 1000 });
  });
});
