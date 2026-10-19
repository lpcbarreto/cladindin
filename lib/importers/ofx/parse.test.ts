import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOfx, parseOfxAmount, parseOfxDate } from "./parse";
import { ImportError } from "../types";

const fixture = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, "../../../fixtures/ofx", name)));

describe("parseOfxDate", () => {
  it.each([
    ["20261019", "2026-10-19"],
    ["20261019120000", "2026-10-19"],
    ["20261019120000.000[-3:BRT]", "2026-10-19"],
    ["20261019000000[-03:EST]", "2026-10-19"],
    ["20261399", null],
    ["20260230", null],
    ["", null],
  ])("%s → %s", (raw, expected) => expect(parseOfxDate(raw)).toBe(expected));
});

describe("parseOfxAmount", () => {
  it.each([
    ["-189,73", -18973],
    ["3500.00", 350000],
    ["-1.250,00", -125000],
    ["+20,5", 2050],
    ["1500", 150000],
    ["-7.5", -750],
    ["12,30-", -1230],
    ["1.000", 100],
    ["abc", null],
  ])("%s → %s", (raw, expected) => expect(parseOfxAmount(raw)).toBe(expected));
});

describe("parseOfx", () => {
  it("lê OFX 1.x SGML em Windows-1252 com vírgula decimal", () => {
    const { statements, warnings } = parseOfx(fixture("banco-sgml-latin1.ofx"));
    expect(statements).toHaveLength(1);
    const s = statements[0];
    expect(s).toMatchObject({ source: "bank", bankId: "341", branchId: "0001", accountId: "12345-6", accountType: "CHECKING" });
    expect(s.startDate).toBe("2026-10-01");
    expect(s.balance).toEqual({ amountCents: 199237, date: "2026-10-15" });
    expect(s.transactions).toHaveLength(5);
    expect(s.transactions[1]).toMatchObject({ amountCents: -18973, description: "PAG CONTA - PAGAMENTO CONTA ÁGUA SANEAMENTO", externalId: "20261005001" });
    expect(s.transactions[4].amountCents).toBe(-125000);
    // FITID repetido é descartado
    expect(s.transactions[2].externalId).toBeNull();
    expect(s.transactions[3].externalId).toBeNull();
    expect(warnings.join(" ")).toMatch(/FITID repetido/);
  });

  it("lê OFX 2.x XML com BOM e entidades", () => {
    const { statements } = parseOfx(fixture("banco-xml-utf8-bom.ofx"));
    const s = statements[0];
    expect(s.bankId).toBe("260");
    expect(s.transactions.map((t) => t.amountCents)).toEqual([-4250, 10000, -4250]);
    expect(s.transactions[0].description).toBe("Padaria São João & Filhos");
    expect(s.transactions[0].date).toBe("2026-10-03");
  });

  it("lê fatura de cartão (CCSTMTRS)", () => {
    const { statements } = parseOfx(fixture("cartao-sgml.ofx"));
    const s = statements[0];
    expect(s.source).toBe("credit_card");
    expect(s.accountId).toBe("5555XXXXXXXX1234");
    expect(s.transactions).toHaveLength(5);
    expect(s.transactions.find((t) => t.externalId === "cc3")?.amountCents).toBe(150000);
    expect(s.balance?.amountCents).toBe(-30410);
  });

  it("tolera OFX malformado: tags sem fechamento, linhas em branco, FITID vazio", () => {
    const { statements, warnings } = parseOfx(fixture("malformado.ofx"));
    const s = statements[0];
    expect(s.accountType).toBe("SAVINGS");
    expect(s.bankId).toBe("1");
    expect(s.transactions).toHaveLength(2);
    expect(s.transactions[0]).toMatchObject({ amountCents: 2050, externalId: null, description: "RENDIMENTO POUPANÇA" });
    expect(s.transactions[1].description).toBe("COMPRA CARTAO PADARIA EXEMPLO 12/10");
    expect(warnings.filter((w) => w.includes("ignorado"))).toHaveLength(2);
  });

  it("explica quando o arquivo não é OFX", () => {
    expect(() => parseOfx(new TextEncoder().encode("data;valor\n01/10/2026;10,00"))).toThrow(ImportError);
  });
});
