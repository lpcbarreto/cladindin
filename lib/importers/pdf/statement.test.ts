import { describe, expect, it } from "vitest";
import { parseStatementText } from "./statement";
import { looksLikeReceipt, parseReceiptText } from "./receipt";

const EXTRATO = `BANCO EXEMPLO S.A.
Extrato de conta corrente
Período: 01/10/2026 a 15/10/2026
Data Histórico Valor Saldo
01/10 SALDO ANTERIOR 1.000,00 C
02/10 PIX RECEBIDO MARIA SILVA 350,00 C 1.350,00 C
03/10 COMPRA CARTAO DEBITO PADARIA 23,90 D 1.326,10 C
TARIFA PACOTE SERVICOS 19,90 D 1.306,20 C
05/10 PAGAMENTO BOLETO ENERGIA 180,45 D 1.125,75 C
SALDO FINAL 1.125,75 C`;

describe("extrato em PDF", () => {
  it("lê débitos, créditos, linhas sem data e o saldo final", () => {
    const r = parseStatementText(EXTRATO);
    expect(r.statement.transactions.map((t) => [t.date, t.description, t.amountCents])).toEqual([
      ["2026-10-02", "PIX RECEBIDO MARIA SILVA", 35000],
      ["2026-10-03", "COMPRA CARTAO DEBITO PADARIA", -2390],
      ["2026-10-03", "TARIFA PACOTE SERVICOS", -1990],
      ["2026-10-05", "PAGAMENTO BOLETO ENERGIA", -18045],
    ]);
    expect(r.statement.balance).toEqual({ amountCents: 112575, date: "2026-10-05" });
    expect(r.signGuessed).toBe(false);
  });

  it("aceita sinal de menos e deduz o sinal quando o extrato não marca", () => {
    expect(parseStatementText("10/10/2026 COMPRA MERCADO -45,90").statement.transactions[0].amountCents).toBe(-4590);
    const g = parseStatementText("10/10/2026 SALARIO EMPRESA 3.500,00\n11/10/2026 ALUGUEL 1.200,00");
    expect(g.signGuessed).toBe(true);
    expect(g.statement.transactions.map((t) => t.amountCents)).toEqual([350000, -120000]);
  });

  it("dezembro num extrato de janeiro fica no ano anterior", () => {
    const r = parseStatementText("Emitido em 10/01/2027\n30/12 COMPRA X 10,00 D");
    expect(r.statement.transactions[0].date).toBe("2026-12-30");
  });
});

describe("comprovantes em PDF", () => {
  it("Pix enviado com recebedor em bloco", () => {
    const text = `Comprovante de transferência
Pix enviado
Valor R$ 1.250,00
Data 18/10/2026 às 14:32
Destino
Nome
JOAO DA SILVA
CPF ***.123.456-**
Instituição BANCO X`;
    expect(looksLikeReceipt(text)).toBe(true);
    expect(parseReceiptText(text)).toEqual({
      kind: "Pix",
      direction: "out",
      amountCents: 125000,
      date: "2026-10-18",
      counterparty: "Joao Da Silva",
      description: "Pix para Joao Da Silva",
    });
  });

  it("Pix recebido e boleto", () => {
    const pix = parseReceiptText("Comprovante\nPix recebido\nValor: 80,00\n05 out 2026\nQuem pagou: Ana Souza");
    expect(pix).toMatchObject({ direction: "in", amountCents: 8000, date: "2026-10-05", description: "Pix de Ana Souza" });
    const boleto = parseReceiptText("Comprovante de pagamento\nBoleto\nBeneficiário: ENERGIA SA CNPJ 00.000.000/0001-00\nData do pagamento: 10/10/2026\nValor pago R$ 180,45");
    expect(boleto).toMatchObject({ kind: "Boleto", direction: "out", amountCents: 18045, date: "2026-10-10", counterparty: "Energia Sa" });
  });

  it("extrato não é confundido com comprovante", () => {
    expect(looksLikeReceipt(EXTRATO)).toBe(false);
  });
});
