import { describe, expect, it } from "vitest";
import { dueEmail, weeklyEmail } from "./notify";

describe("e-mails de aviso", () => {
  it("lista as contas e escapa HTML", () => {
    const e = dueEmail(
      [
        { workspace: "Casa", description: "Luz <script>", dueDate: "2026-10-21", cents: 18000, kind: "expense" },
        { workspace: "Casa", description: "Aluguel", dueDate: "2026-10-22", cents: 150000, kind: "expense" },
      ],
      "https://exemplo.test",
    );
    expect(e.subject).toContain("2 contas");
    expect(e.html).toContain("Luz &lt;script&gt;");
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("21/10/2026");
  });
  it("resumo semanal mostra atrasados", () => {
    const e = weeklyEmail([{ workspace: "Pessoal", income: 500000, expense: 120000, overdue: 2, nextWeek: [] }], "https://exemplo.test");
    expect(e.html).toContain("conta(s) atrasada(s)");
    expect(e.html).toContain("Nada vence");
  });
});
