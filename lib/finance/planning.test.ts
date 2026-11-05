import { describe, expect, it } from "vitest";
import { addMonthsToDate, firstNegativeMonth, monthlyPlan, monthsToDue, reservePlan, simulationItems, splitCents } from "./planning";

const today = "2026-11-05";

describe("calendário mês a mês", () => {
  const plan = monthlyPlan(100000, today, 3, [
    { id: "a", date: "2026-10-28", cents: -20000, description: "Atrasado", kind: "lancamento" },
    { id: "b", date: "2026-11-10", cents: 350000, description: "Salário", kind: "lancamento" },
    { id: "c", date: "2026-11-20", cents: -150000, description: "Aluguel", kind: "lancamento" },
    { id: "d", date: "2026-12-05", cents: -400000, description: "Fatura", kind: "fatura" },
    { id: "e", date: "2027-05-01", cents: -1, description: "Fora da janela", kind: "lancamento" },
  ]);

  it("agrupa por mês, atrasado entra no mês atual e ignora o que passa da janela", () => {
    expect(plan.map((m) => m.month)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(plan[0].items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(plan[0].items[0].date).toBe(today);
  });

  it("saldo inicial, final e menor saldo de cada mês", () => {
    expect(plan[0]).toMatchObject({ startBalance: 100000, income: 350000, expense: 170000, net: 180000, endBalance: 280000, lowest: 80000 });
    expect(plan[1]).toMatchObject({ startBalance: 280000, endBalance: -120000, lowest: -120000 });
    expect(plan[2]).toMatchObject({ startBalance: -120000, endBalance: -120000 });
    expect(firstNegativeMonth(plan)).toBe("2026-12");
  });
});

describe("simulador e se", () => {
  it("parcela o total e cai no mês certo, inclusive fim de mês", () => {
    expect(splitCents(100000, 3)).toEqual([33333, 33333, 33334]);
    expect(addMonthsToDate("2027-01-31", 1)).toBe("2027-02-28");
    const items = simulationItems({ description: "Notebook", totalCents: 300000, kind: "expense", installments: 3, firstDate: "2026-11-15" });
    expect(items.map((i) => [i.date, i.cents, i.installment])).toEqual([
      ["2026-11-15", -100000, "1/3"],
      ["2026-12-15", -100000, "2/3"],
      ["2027-01-15", -100000, "3/3"],
    ]);
  });

  it("valor vazio não simula nada", () => {
    expect(simulationItems({ description: "", totalCents: 0, kind: "expense", installments: 1, firstDate: today })).toEqual([]);
  });
});

describe("reserva mensal", () => {
  it("conta o mês atual até o mês do vencimento", () => {
    expect(monthsToDue(today, "2027-01-10")).toBe(3);
    expect(monthsToDue(today, "2026-11-30")).toBe(1);
  });

  it("quanto separar por mês e o total", () => {
    const r = reservePlan(
      [
        { id: "ipva", description: "IPVA", dueDate: "2027-01-20", cents: 180000 },
        { id: "atrasada", description: "Matrícula", dueDate: "2026-10-01", cents: 50000 },
      ],
      today,
    );
    expect(r.rows.map((x) => [x.id, x.months, x.perMonth, x.late])).toEqual([
      ["atrasada", 1, 50000, true],
      ["ipva", 3, 60000, false],
    ]);
    expect(r.totalPerMonth).toBe(110000);
  });
});
