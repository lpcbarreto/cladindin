import { describe, expect, it } from "vitest";
import { projectBalance } from "./projection";

describe("projectBalance", () => {
  it("acumula eventos e acha o ponto mais baixo e o primeiro negativo", () => {
    const r = projectBalance(10000, "2026-10-20", 10, [
      { date: "2026-10-22", cents: -15000, description: "aluguel" },
      { date: "2026-10-25", cents: 20000, description: "salário" },
    ]);
    expect(r.points).toHaveLength(11);
    expect(r.lowest).toEqual({ date: "2026-10-22", balance: -5000 });
    expect(r.firstNegative).toBe("2026-10-22");
    expect(r.end).toBe(15000);
  });
  it("atrasados entram no dia de hoje", () => {
    const r = projectBalance(0, "2026-10-20", 1, [{ date: "2026-10-01", cents: -100, description: "x" }]);
    expect(r.points[0]).toEqual({ date: "2026-10-20", balance: -100 });
  });
  it("sem eventos fica estável", () => {
    expect(projectBalance(500, "2026-10-20", 3, []).firstNegative).toBeNull();
  });
});
