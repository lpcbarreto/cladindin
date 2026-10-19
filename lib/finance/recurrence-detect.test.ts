import { describe, expect, it } from "vitest";
import { detectRecurring, type HistoryTx } from "./recurrence-detect";

const tx = (description: string, amountCents: number, date: string, accountId = "a"): HistoryTx => ({
  accountId,
  description,
  amountCents,
  date,
  categoryId: null,
});

describe("detectRecurring", () => {
  it("detecta streaming mensal de valor fixo", () => {
    const s = detectRecurring([
      tx("NETFLIX COM", -5590, "2026-07-19"),
      tx("NETFLIX COM", -5590, "2026-08-19"),
      tx("NETFLIX COM", -5590, "2026-09-19"),
      tx("NETFLIX COM", -5590, "2026-10-19"),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ amountCents: 5590, variable: false, day: 19, months: 4, type: "expense" });
  });

  it("conta de luz com valor variável", () => {
    const [s] = detectRecurring([
      tx("PAG CONTA ENERGIA 12345678", -18000, "2026-07-10"),
      tx("PAG CONTA ENERGIA 87654321", -19500, "2026-08-11"),
      tx("PAG CONTA ENERGIA 11223344", -17200, "2026-09-10"),
    ]);
    expect(s).toMatchObject({ variable: true, amountCents: 18000, day: 10 });
  });

  it("ignora compras avulsas, valores muito diferentes e o que já tem regra", () => {
    expect(
      detectRecurring([tx("PADARIA", -1000, "2026-07-01"), tx("PADARIA", -1200, "2026-07-03"), tx("PADARIA", -900, "2026-07-20")]),
    ).toHaveLength(0);
    expect(
      detectRecurring([tx("LOJA X", -1000, "2026-07-01"), tx("LOJA X", -9000, "2026-08-01"), tx("LOJA X", -500, "2026-09-01")]),
    ).toHaveLength(0);
    const netflix = [tx("NETFLIX", -5590, "2026-07-19"), tx("NETFLIX", -5590, "2026-08-19"), tx("NETFLIX", -5590, "2026-09-19")];
    expect(detectRecurring(netflix, new Set(["NETFLIX"]))).toHaveLength(0);
  });
});
