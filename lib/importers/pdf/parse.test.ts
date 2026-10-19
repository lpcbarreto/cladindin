import { describe, expect, it } from "vitest";
import { parseInvoiceText } from "./parse";

// Texto como sai de um PDF de fatura (fictício)
const TEXT = `
BANCO EXEMPLO S.A.
Resumo da fatura
Vencimento: 10/01/2027
Total desta fatura R$ 1.475,90
Pagamento mínimo R$ 147,59
Lançamentos
20/12 LOJA ELETRO EXEMPLO 03/10 300,00
22/12 MERCADO FICTÍCIO 1.089,90
02/01 PAGAMENTO RECEBIDO -1.500,00
03/01 ESTORNO MERCADO 89,90-
05/01 IOF COMPRA INTERNACIONAL 4,10
06 JAN ANUIDADE 29,00
Subtotal 1.475,90
`;

describe("parseInvoiceText", () => {
  const r = parseInvoiceText(TEXT);
  it("lê vencimento e total", () => {
    expect(r.dueDate).toBe("2027-01-10");
    expect(r.totalCents).toBe(147590);
  });
  it("lê as linhas e infere o ano (dezembro é do ano anterior)", () => {
    expect(r.transactions.map((t) => [t.date, t.amountCents, t.description])).toEqual([
      ["2026-12-20", -30000, "LOJA ELETRO EXEMPLO 03/10"],
      ["2026-12-22", -108990, "MERCADO FICTÍCIO"],
      ["2027-01-02", 150000, "PAGAMENTO RECEBIDO"],
      ["2027-01-03", 8990, "ESTORNO MERCADO"],
      ["2027-01-05", -410, "IOF COMPRA INTERNACIONAL"],
      ["2027-01-06", -2900, "ANUIDADE"],
    ]);
  });
});
