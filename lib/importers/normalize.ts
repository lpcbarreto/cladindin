import { createHash } from "node:crypto";

// Prefixos genéricos que os bancos colocam antes do nome do estabelecimento ou pessoa
const PREFIXES = [
  "COMPRA CARTAO DEB(ITO)?",
  "COMPRA CARTAO",
  "COMPRA COM CARTAO",
  "COMPRA DEBITO",
  "COMPRA NO DEBITO",
  "COMPRA ELO DEBITO",
  "COMPRA VISA ELECTRON",
  "COMPRA MAESTRO",
  "PAG(TO|AMENTO)? (DE )?BOLETO",
  "PAGTO",
  "PIX (ENVIADO|RECEBIDO|TRANSF|QRS|QR CODE)",
  "TRANSF(ERENCIA)? (ENVIADA|RECEBIDA|PIX)",
  "TED (ENVIADA|RECEBIDA)",
  "DOC (ENVIADO|RECEBIDO)",
  "DEB(ITO)? AUT(OMATICO)?",
  "SAQUE",
  "TRANSFERENCIA",
];
const PREFIX_RE = new RegExp(`^(${PREFIXES.join("|")})\\b[\\s:-]*`);

/**
 * Normaliza descrição de extrato para comparar e criar regras: sem acentos, maiúsculas,
 * sem prefixos genéricos, datas, horários, códigos longos e parcelas.
 */
export function normalizeDescription(raw: string): string {
  let s = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9/: ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 2; i++) s = s.replace(PREFIX_RE, "");
  s = s
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ") // datas e parcelas 03/10
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, " ") // horários
    .replace(/\bPARC(ELA)?\b( ?\d+( DE \d+)?)?/g, " ")
    .replace(/[/:]/g, " ")
    .replace(/\b\d{5,}\b/g, " ") // códigos, documentos, autorizações
    .replace(/\b[A-Z0-9]*\d[A-Z0-9]*\b/g, (w) => (w.length >= 8 ? " " : w)) // ids alfanuméricos longos
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

/** Fingerprint estável para deduplicação quando o FITID não existe ou muda entre exportações. */
export function fingerprint(accountId: string, date: string, amountCents: number, description: string, ordinal: number) {
  return createHash("sha256")
    .update([accountId, date, amountCents, normalizeDescription(description), ordinal].join("|"))
    .digest("hex")
    .slice(0, 40);
}

/**
 * Atribui a cada lançamento a ordem dele entre iguais (mesma data, valor e descrição) no arquivo.
 * Assim, duas compras idênticas no mesmo dia geram fingerprints diferentes, e reimportar o
 * mesmo dia gera os mesmos fingerprints.
 */
export function withFingerprints<T extends { date: string; amountCents: number; description: string }>(
  accountId: string,
  rows: T[],
): (T & { fingerprint: string })[] {
  const counts = new Map<string, number>();
  return rows.map((r) => {
    const key = `${r.date}|${r.amountCents}|${normalizeDescription(r.description)}`;
    const ordinal = counts.get(key) ?? 0;
    counts.set(key, ordinal + 1);
    return { ...r, fingerprint: fingerprint(accountId, r.date, r.amountCents, r.description, ordinal) };
  });
}

export function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
