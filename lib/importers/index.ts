import { parseOfx, looksLikeOfx } from "./ofx/parse";
import { readCsvTable, headerSignature, type CsvTable } from "./csv/parse";
import { extractPdfText, looksLikeInvoice, parseInvoiceOrThrow, type PdfInvoice } from "./pdf/parse";
import { parseStatementText, type PdfStatementResult } from "./pdf/statement";
import { looksLikeReceipt, parseReceiptText, type PdfReceipt } from "./pdf/receipt";
import { decodeBankFile } from "./encoding";
import { ImportError, type ParseResult } from "./types";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 10;

export type LoadedFile =
  | { kind: "ofx"; result: ParseResult }
  | { kind: "csv"; table: CsvTable; signature: string }
  | { kind: "pdf"; invoice: PdfInvoice }
  | { kind: "pdf-statement"; result: PdfStatementResult }
  | { kind: "receipt"; receipt: PdfReceipt };

/**
 * Escolhe o importador pelo conteúdo (não só pela extensão). Novos formatos e emissores
 * entram aqui. Veja docs/importadores.md.
 */
export async function loadBankFile(fileName: string, bytes: Uint8Array): Promise<LoadedFile> {
  if (bytes.byteLength === 0) throw new ImportError("O arquivo está vazio.");
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new ImportError("O arquivo passa de 5 MB.", "Exporte um período menor no app do banco.");
  }
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 8));
  if (head.startsWith("%PDF")) return loadPdf(await extractPdfText(bytes));

  const { text } = decodeBankFile(bytes.subarray(0, 4096));
  if (looksLikeOfx(text) || /\.(ofx|qfx)$/i.test(fileName)) return { kind: "ofx", result: parseOfx(bytes) };
  if (/\.(csv|txt)$/i.test(fileName) || /[;,\t]/.test(text.split(/\r?\n/)[0] ?? "")) {
    const table = readCsvTable(bytes);
    return { kind: "csv", table, signature: headerSignature(table.headers) };
  }
  throw new ImportError(
    `Formato não reconhecido em "${fileName}".`,
    "Use OFX, CSV ou PDF (extrato, fatura ou comprovante) exportados pelo banco.",
  );
}

/** PDF com texto: comprovante (Pix/boleto/transferência), fatura de cartão ou extrato. */
export function loadPdf(text: string): LoadedFile {
  if (looksLikeReceipt(text)) {
    const receipt = parseReceiptText(text);
    if (receipt) return { kind: "receipt", receipt };
  }
  if (looksLikeInvoice(text)) return { kind: "pdf", invoice: parseInvoiceOrThrow(text) };
  const result = parseStatementText(text);
  if (result.statement.transactions.length) return { kind: "pdf-statement", result };
  // Última tentativa: layout de fatura sem a palavra "vencimento"
  return { kind: "pdf", invoice: parseInvoiceOrThrow(text) };
}

export { ImportError };
export type { ParseResult, ParsedStatement, ParsedTransaction } from "./types";
