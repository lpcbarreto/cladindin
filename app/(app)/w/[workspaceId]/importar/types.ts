import type { RowStatus } from "@/lib/importers/match";

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
};

export type PreviewStatement = {
  key: string;
  source: "bank" | "credit_card";
  bankId: string | null;
  externalAccountId: string | null;
  label: string;
  startDate: string | null;
  endDate: string | null;
  balance: { amountCents: number; date: string } | null;
  accountId: string | null;
  /** Data em que este mesmo arquivo já foi importado nesta conta, se for o caso. */
  sameFileImportedAt: string | null;
  rows: PreviewRow[] | null;
};

export type PreviewFile = {
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
      balanceCheck: { statement: number; system: number; date: string } | null;
    }
  | { ok: false; message: string };
