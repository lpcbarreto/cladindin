import { describe, expect, it } from "vitest";
import { describeAudit } from "./audit";

describe("describeAudit", () => {
  it("descreve mudança de valor", () => {
    const s = describeAudit({
      table_name: "transactions",
      action: "update",
      old_data: { description: "Internet", amount_cents: 12990, status: "planned" },
      new_data: { description: "Internet", amount_cents: 13990, status: "planned" },
    });
    expect(s).toContain("mudou o valor");
    expect(s).toContain("Internet");
  });
  it("exclusão suave e aprovação", () => {
    expect(describeAudit({ table_name: "transactions", action: "update", old_data: { description: "X", deleted_at: null }, new_data: { description: "X", deleted_at: "2026-11-06" } })).toBe("excluiu “X”");
    expect(describeAudit({ table_name: "transactions", action: "update", old_data: { description: "X", approval: "pending" }, new_data: { description: "X", approval: "approved" } })).toBe("aprovou “X”");
  });
  it("ignora atualização sem mudança visível", () => {
    expect(describeAudit({ table_name: "transactions", action: "update", old_data: { description: "X", updated_at: 1 }, new_data: { description: "X", updated_at: 2 } })).toBeNull();
  });
});
