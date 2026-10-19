import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyMapping, detectDelimiter, guessMapping, parseCsvAmount, parseCsvDate, readCsvTable, splitCsv } from "./parse";

const fixture = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, "../../../fixtures/csv", name)));

describe("splitCsv / detectDelimiter", () => {
  it("respeita aspas, aspas duplicadas e separador dentro do campo", () => {
    expect(splitCsv('a;"b;c";"d ""e"""\n1;2;3', ";")).toEqual([
      ["a", "b;c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });
  it("detecta ; , e tab", () => {
    expect(detectDelimiter("a;b;c\n1;2,5;3")).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });
});

describe("parseCsvAmount", () => {
  it.each([
    ["1.089,90", 108990],
    ["300,00", 30000],
    ["-1500.00", -150000],
    ["R$ 1.234,56", 123456],
    ["(10,00)", -1000],
    ["189,73 D", -18973],
    ["4.10", 410],
    ["1.234.567", 123456700],
    ["", null],
    ["abc", null],
  ])("%s → %s", (raw, expected) => expect(parseCsvAmount(raw)).toBe(expected));
});

describe("parseCsvDate", () => {
  it.each([
    ["20/09/2026", "dmy", "2026-09-20"],
    ["01/10/26", "dmy", "2026-10-01"],
    ["2026-09-20", "dmy", "2026-09-20"],
    ["09/20/2026", "mdy", "2026-09-20"],
    ["20 SET", "dmy", "2026-09-20"],
    ["31/02/2026", "dmy", null],
  ] as const)("%s (%s) → %s", (raw, f, expected) => expect(parseCsvDate(raw, f, 2026)).toBe(expected));
});

describe("layouts", () => {
  it("Nubank fatura: preset, sinais invertidos, aspas", () => {
    const table = readCsvTable(fixture("nubank-fatura.csv"));
    const { mapping, preset } = guessMapping(table);
    expect(preset).toBe("Nubank (fatura do cartão)");
    const { transactions } = applyMapping(table, mapping);
    expect(transactions.map((t) => t.amountCents)).toEqual([-30000, -8990, 150000, 8990, -410]);
    expect(transactions[4].description).toBe('IOF de "compra internacional"');
  });

  it("C6 fatura em Latin-1: preset com parcela e portador", () => {
    const table = readCsvTable(fixture("c6-fatura-latin1.csv"));
    const { mapping, preset } = guessMapping(table);
    expect(preset).toBe("C6 Bank (fatura do cartão)");
    const { transactions } = applyMapping(table, mapping);
    expect(transactions).toHaveLength(3);
    expect(transactions[0]).toMatchObject({ date: "2026-09-20", amountCents: -30000, installment: "3/10", cardholder: "MARIA EXEMPLO" });
    expect(transactions[1]).toMatchObject({ description: "MERCADO FICTÍCIO", amountCents: -108990 });
  });

  it("extrato com linhas antes do cabeçalho e colunas débito/crédito", () => {
    const table = readCsvTable(fixture("banco-debito-credito.csv"));
    expect(table.headers[1]).toBe("Histórico");
    const { mapping, preset } = guessMapping(table);
    expect(preset).toBeNull();
    expect(mapping.debit).toBe(2);
    expect(mapping.credit).toBe(3);
    const { transactions, skipped } = applyMapping(table, mapping);
    expect(transactions.map((t) => [t.date, t.amountCents])).toEqual([
      ["2026-10-01", 350000],
      ["2026-10-05", -18973],
    ]);
    expect(skipped).toBe(1);
  });
});
