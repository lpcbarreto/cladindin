// Contrato comum de todos os importadores (OFX, CSV, PDF, adaptadores por emissor).

export type ParsedTransaction = {
  /** Identificador do banco (FITID). Pode ser vazio ou instável. */
  externalId: string | null;
  /** Data do lançamento (AAAA-MM-DD). */
  date: string;
  /** Valor em centavos com sinal: negativo = saída/compra, positivo = entrada/crédito. */
  amountCents: number;
  /** Descrição pronta para exibir (NAME + MEMO combinados). */
  description: string;
  /** TRNTYPE do OFX ou equivalente (DEBIT, CREDIT, PAYMENT...). */
  kind: string | null;
  checkNum: string | null;
  refNum: string | null;
};

export type ParsedStatement = {
  source: "bank" | "credit_card";
  bankId: string | null;
  branchId: string | null;
  accountId: string | null;
  accountType: string | null;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  /** Saldo final informado pelo banco (LEDGERBAL), quando existir. */
  balance: { amountCents: number; date: string } | null;
  transactions: ParsedTransaction[];
};

export type ParseResult = {
  parser: string;
  statements: ParsedStatement[];
  /** Avisos não fatais (linhas ignoradas, FITID repetido etc.). */
  warnings: string[];
};

export class ImportError extends Error {
  constructor(
    message: string,
    /** Sugestão do que o usuário pode fazer. */
    public hint?: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}
