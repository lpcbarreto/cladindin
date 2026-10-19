import { describe, expect, it } from "vitest";
import { addDays, formatDateBR, monthRange, shiftMonth, todayISO } from "./dates";

describe("dates", () => {
  it("usa o fuso de São Paulo para 'hoje'", () => {
    // 02:00 UTC de 1º de março = 23:00 de 28 de fevereiro em SP
    expect(todayISO(new Date("2026-03-01T02:00:00Z"))).toBe("2026-02-28");
  });
  it("monthRange considera ano bissexto", () => {
    expect(monthRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(monthRange("2026-12").end).toBe("2026-12-31");
  });
  it("shiftMonth atravessa anos", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("addDays e formatDateBR", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(formatDateBR("2026-10-19")).toBe("19/10/2026");
  });
});
