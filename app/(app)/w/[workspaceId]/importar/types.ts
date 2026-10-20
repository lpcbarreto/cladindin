import type { RowStatus } from "@/lib/importers/match";
import type { CsvMapping } from "@/lib/importers/csv/parse";

export type PreviewRow = {
  index: number;
  date: string;
  amountCents: number;
  description: string;
  externalId: string | null;
  fingerprint: string;
  status: RowStatus;
  suggestedCategoryId: string | null;
  include: boolean;
  note: string | null;
  installment: { number: number; total: number; key: string } | null;
  cardholder: string | null;
};

export type CsvInfo = {
  headers: string[];
  sample: string[][];
  mapping: CsvMapping;
  preset: string | null;
  signature: string;
  /** Nome do modelo salvo que foi aplicado, se houver. */
  template: string | null;
  skipped: number;
};

export type PreviewStatement = {
  key: string;
  kind: "ofx" | "csv" | "pdf";
  source: "bank" | "credit_card";
  bankId: string | null;
  externalAccountId: string | null;
  label: string;
  startDate: string | null;
  endDate: string | null;
  balance: { amountCents: number; date: string } | null;
  accountId: string | null;
  isCardAccount: boolean;
  /** Vencimento sugerido da fatura (cartão). */
  invoiceDueDate: string | null;
  declaredTotalCents: number | null;
  sameFileImportedAt: string | null;
  csv: CsvInfo | null;
  /** Comprovante em PDF: vira um lançamento e o arquivo é anexado a ele. */
  receipt?: { kind: string; counterparty: string | null } | null;
  rows: PreviewRow[] | null;
};

export type PreviewFile = {
  /** Posição do arquivo no envio (para anexar o PDF do comprovante depois). */
  fileIndex: number;
  fileName: string;
  fileHash: string;
  parser: string;
  warnings: string[];
  statements: PreviewStatement[];
  error?: { message: string; hint?: string };
};

export type PreviewResult = { ok: true; files: PreviewFile[] } | { ok: false; message: string };

export type CommitResult =
  | {
      ok: true;
      batchId: string;
      created: number;
      duplicates: number;
      reconciled: number;
      projected: number;
      invoiceId: string | null;
      balanceCheck: { statement: number; system: number; date: string } | null;
      invoiceCheck: { declared: number; computed: number } | null;
    }
  | { ok: false; message: string };
