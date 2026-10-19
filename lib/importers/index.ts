import { parseOfx, looksLikeOfx } from "./ofx/parse";
import { decodeBankFile } from "./encoding";
import { ImportError, type ParseResult } from "./types";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 10;

/**
 * Escolhe o importador pelo conteúdo (não só pela extensão). Novos formatos (CSV, PDF,
 * adaptadores por emissor) entram aqui. Veja docs/importadores.md.
 */
export function parseBankFile(fileName: string, bytes: Uint8Array): ParseResult {
  if (bytes.byteLength === 0) throw new ImportError("O arquivo está vazio.");
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new ImportError("O arquivo passa de 5 MB.", "Exporte um período menor no app do banco.");
  }
  const { text } = decodeBankFile(bytes.subarray(0, 4096));
  if (looksLikeOfx(text) || /\.(ofx|qfx)$/i.test(fileName)) return parseOfx(bytes);
  if (/\.pdf$/i.test(fileName) || text.startsWith("%PDF")) {
    throw new ImportError(
      "PDF ainda não é suportado.",
      "Baixe o extrato ou a fatura em OFX no app do banco. A importação de CSV e PDF de fatura chega na próxima fase.",
    );
  }
  throw new ImportError(
    `Formato não reconhecido em "${fileName}".`,
    "Use um arquivo OFX exportado pelo banco (às vezes chamado de Money ou Quicken).",
  );
}

export { ImportError };
export type { ParseResult, ParsedStatement, ParsedTransaction } from "./types";
