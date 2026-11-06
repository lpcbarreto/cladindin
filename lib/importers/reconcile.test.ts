import { describe, expect, it } from "vitest";
import { suggestMatches } from "./reconcile";

const acc = "a";
describe("suggestMatches", () => {
  it("junta valor igual e data próxima com confiança alta", () => {
    const r = suggestMatches(
      [{ id: "l1", accountId: acc, date: "2026-11-04", amountCents: -28740, description: "PAG CEMIG DIST" }],
      [{ id: "p1", accountId: acc, date: "2026-11-05", amountCents: -28740, description: "Conta de luz" }],
    );
    expect(r[0].planned?.id).toBe("p1");
    expect(r[0].confidence).toBe("high");
  });

  it("valor diferente dentro da tolerância vira sugestão média", () => {
    const r = suggestMatches(
      [{ id: "l1", accountId: acc, date: "2026-11-02", amountCents: -13990, description: "VIVO FIXO" }],
      [{ id: "p1", accountId: acc, date: "2026-11-08", amountCents: -12990, description: "Internet" }],
    );
    expect(r[0].confidence).toBe("medium");
  });

  it("ignora outra conta, sinal oposto e data longe; usa cada previsto uma vez", () => {
    const r = suggestMatches(
      [
        { id: "l1", accountId: acc, date: "2026-11-01", amountCents: -5000, description: "X" },
        { id: "l2", accountId: acc, date: "2026-11-01", amountCents: -5000, description: "X" },
        { id: "l3", accountId: acc, date: "2026-11-01", amountCents: 5000, description: "Y" },
      ],
      [
        { id: "p1", accountId: acc, date: "2026-11-01", amountCents: -5000, description: "X" },
        { id: "p2", accountId: "b", date: "2026-11-01", amountCents: -5000, description: "X" },
        { id: "p3", accountId: acc, date: "2026-12-01", amountCents: 5000, description: "Y" },
      ],
    );
    expect(r.filter((s) => s.planned).map((s) => s.planned!.id)).toEqual(["p1"]);
    expect(r[2].planned).toBeNull();
  });
});
