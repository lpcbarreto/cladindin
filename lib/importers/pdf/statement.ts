import { parseCsvAmount, parseCsvDate } from "../csv/parse";
import type { ParsedStatement, ParsedTransaction } from "../types";

const MONEY = String.raw`[-+]?\s?(?:R\$\s?)?\d{1,3}(?:\.\d{3})*,\d{2}\s?-?`;
const DATE = String.raw`\d{2}\/\d{2}(?:\/\d{2,4})?`;
// "05/10 PIX ENVIADO FULANO 120,00 D 1.380,00" · "05/10/2026 SALARIO 3.500,00 C" · "05/10 COMPRA -45,90"
const LINE = new RegExp(String.raw`^(${DATE})\s+(.+?)\s+(${MONEY})(?:\s*([DC])\b)?(?:\s+(${MONEY})(?:\s*[DC]\b)?)?$`, "i");
// Linha sem data logo abaixo de uma datada (vários lançamentos no mesmo dia)
const CONT = new RegExp(String.raw`^([A-Za-zÀ-ú*].+?)\s+(${MONEY})(?:\s*([DC])\b)?(?:\s+(${MONEY})(?:\s*[DC]\b)?)?$`, "i");
const IGNORE = /^(saldo|s\s?a\s?l\s?d\s?o|total|subtotal|resumo|limite|lan[cç]amentos futuros|valor\b|data\b|hist[oó]rico)/i;
const BALANCE = new RegExp(String.raw`saldo\s+(?:final|dispon[ií]vel|atual|do dia|em\s+${DATE})[^\d\n-]{0,25}(${MONEY})\s*([DC])?`, "gi");
const CREDIT_WORDS = /RECEB|CR[EÉ]DITO|DEP[OÓ]SITO|SAL[AÁ]RIO|ESTORNO|DEVOLU|RENDIMENTO|RESGATE|TED RECEBIDA|PIX RECEBIDO|TRANSF(?:ERENCIA)? RECEBIDA/i;

export type PdfStatementResult = { statement: ParsedStatement; skippedLines: number; signGuessed: boolean };

/** Ano de referência: o da data completa mais recente do texto (ou o atual). */
function referenceDate(text: string) {
  const full = [...text.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)]
    .map((m) => `${m[3]}-${m[2]}-${m[1]}`)
    .filter((d) => Number(d.slice(5, 7)) <= 12)
    .sort();
  return full[full.length - 1] ?? null;
}

/**
 * Extrato bancário em PDF (com texto), padrão "data descrição valor [D/C] [saldo]".
 * O sinal vem de "-", "D"/"C"; se o extrato não marca nenhum, deduzimos pela descrição.
 */
export function parseStatementText(text: string): PdfStatementResult {
  const ref = referenceDate(text);
  const year = ref ? Number(ref.slice(0, 4)) : new Date().getFullYear();
  const refMonth = ref ? Number(ref.slice(5, 7)) : 12;

  type Raw = { date: string; description: string; amountRaw: string; dc: string | undefined };
  const raws: Raw[] = [];
  let skippedLines = 0;
  let lastDate: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const m = line.match(LINE);
    if (m) {
      const [, dateRaw, desc, amountRaw, dc] = m;
      let date = parseCsvDate(dateRaw, "dmy", year);
      if (date && (dateRaw.match(/\//g) ?? []).length === 1 && Number(date.slice(5, 7)) > refMonth) {
        date = parseCsvDate(dateRaw, "dmy", year - 1);
      }
      if (!date) {
        skippedLines++;
        continue;
      }
      lastDate = date;
      if (IGNORE.test(desc)) continue;
      raws.push({ date, description: desc.trim(), amountRaw, dc });
      continue;
    }
    const c = lastDate ? line.match(CONT) : null;
    if (c && !IGNORE.test(c[1])) raws.push({ date: lastDate!, description: c[1].trim(), amountRaw: c[2], dc: c[3] });
  }

  const hasSign = (r: Raw) => !!r.dc || /^-|-$|^\+/.test(r.amountRaw.replace(/\s/g, ""));
  const signGuessed = raws.length > 0 && !raws.some(hasSign);
  const transactions: ParsedTransaction[] = [];
  for (const r of raws) {
    const parsed = parseCsvAmount(r.amountRaw.replace(/\s/g, ""));
    if (parsed === null || parsed === 0) {
      skippedLines++;
      continue;
    }
    let cents = parsed;
    if (r.dc) cents = r.dc.toUpperCase() === "D" ? -Math.abs(parsed) : Math.abs(parsed);
    else if (signGuessed) cents = CREDIT_WORDS.test(r.description) ? Math.abs(parsed) : -Math.abs(parsed);
    transactions.push({ externalId: null, date: r.date, amountCents: cents, description: r.description, kind: null, checkNum: null, refNum: null });
  }

  const dates = transactions.map((t) => t.date).sort();
  const balances = [...text.matchAll(BALANCE)];
  const lastBal = balances[balances.length - 1];
  let balance: ParsedStatement["balance"] = null;
  if (lastBal && dates.length) {
    const v = parseCsvAmount(lastBal[1].replace(/\s/g, ""));
    if (v !== null) balance = { amountCents: lastBal[2]?.toUpperCase() === "D" ? -Math.abs(v) : v, date: dates[dates.length - 1] };
  }

  return {
    statement: {
      source: "bank",
      bankId: null,
      branchId: null,
      accountId: null,
      accountType: null,
      currency: "BRL",
      startDate: dates[0] ?? null,
      endDate: dates[dates.length - 1] ?? null,
      balance,
      transactions,
    },
    skippedLines,
    signGuessed,
  };
}
