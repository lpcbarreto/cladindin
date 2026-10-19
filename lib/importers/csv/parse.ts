import { createHash } from "node:crypto";
import { decodeBankFile } from "../encoding";
import { ImportError, type ParsedTransaction } from "../types";

/** Mapeamento de colunas (índices) e convenções de um CSV. */
export type CsvMapping = {
  date: number;
  description: number;
  /** Coluna única de valor, ou par débito/crédito. */
  amount: number | null;
  debit: number | null;
  credit: number | null;
  installment: number | null;
  cardholder: number | null;
  dateFormat: "dmy" | "ymd" | "mdy";
  /** Inverte o sinal (faturas de cartão costumam trazer compras positivas). */
  invert: boolean;
  /** Linhas a pular antes do cabeçalho. */
  headerRow: number;
};

export type CsvTable = { delimiter: string; headers: string[]; rows: string[][]; headerRow: number };

/** Divide CSV respeitando aspas, aspas duplicadas e quebras de linha dentro de campos. */
export function splitCsv(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    out.push(row);
  }
  return out.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ""));
}

/** Escolhe o separador que gera o número de colunas mais consistente (>1). */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30).join("\n");
  let best = { d: ";", score: -1 };
  for (const d of [";", ",", "\t", "|"]) {
    const rows = splitCsv(sample, d);
    const counts = rows.map((r) => r.length).filter((n) => n > 1);
    if (!counts.length) continue;
    const mode = counts.sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0];
    const score = counts.filter((n) => n === mode).length * Math.min(mode, 12);
    if (score > best.score) best = { d, score };
  }
  return best.d;
}

const isDateLike = (s: string) => /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/.test(s) || /^\d{1,2}\s+[A-Za-zç]{3}/.test(s);
const isMoneyLike = (s: string) => /^-?\s*\(?R?\$?\s*-?[\d.,]+\)?-?$/.test(s) && /\d/.test(s);

export function readCsvTable(bytes: Uint8Array): CsvTable {
  const { text } = decodeBankFile(bytes);
  const delimiter = detectDelimiter(text);
  const all = splitCsv(text, delimiter);
  if (all.length < 2) throw new ImportError("O CSV não tem linhas suficientes.", "Confira se o arquivo exportado contém lançamentos.");
  // Cabeçalho: primeira linha (nas 15 primeiras) sem datas/valores e seguida de uma linha com data
  let headerRow = 0;
  for (let i = 0; i < Math.min(15, all.length - 1); i++) {
    const row = all[i];
    const next = all[i + 1];
    if (row.length >= 2 && !row.some(isDateLike) && next.some(isDateLike)) {
      headerRow = i;
      break;
    }
  }
  const headers = all[headerRow].map((h, i) => h || `Coluna ${i + 1}`);
  const rows = all.slice(headerRow + 1).filter((r) => r.length >= Math.min(2, headers.length));
  return { delimiter, headers, rows, headerRow };
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Assinatura do layout (para lembrar o modelo de mapeamento). */
export function headerSignature(headers: string[]) {
  return createHash("sha1").update(headers.map(norm).join("|")).digest("hex").slice(0, 16);
}

type Preset = { name: string; match: (h: string[]) => boolean; mapping: (h: string[]) => Partial<CsvMapping> };
const idx = (h: string[], ...needles: string[]) => {
  for (const n of needles) {
    const i = h.findIndex((x) => x === n);
    if (i >= 0) return i;
  }
  for (const n of needles) {
    const i = h.findIndex((x) => x.includes(n));
    if (i >= 0) return i;
  }
  return -1;
};

/**
 * Layouts conhecidos de emissores brasileiros. Os bancos mudam os arquivos com frequência:
 * se nada casar, o mapeamento automático por nome de coluna e o mapeador manual assumem.
 */
export const PRESETS: Preset[] = [
  {
    name: "Nubank (fatura do cartão)",
    match: (h) => h.join(",") === "date,title,amount" || h.join(",") === "date,category,title,amount",
    mapping: (h) => ({ date: h.indexOf("date"), description: h.indexOf("title"), amount: h.indexOf("amount"), dateFormat: "ymd", invert: true }),
  },
  {
    name: "Nubank (conta)",
    match: (h) => h.includes("data") && h.includes("valor") && h.includes("identificador"),
    mapping: (h) => ({ date: h.indexOf("data"), description: idx(h, "descricao"), amount: h.indexOf("valor"), dateFormat: "dmy", invert: false }),
  },
  {
    name: "C6 Bank (fatura do cartão)",
    match: (h) => h.some((x) => x.startsWith("data de compra")) && h.some((x) => x.includes("valor (em r$)")),
    mapping: (h) => ({
      date: idx(h, "data de compra"),
      description: idx(h, "descricao"),
      amount: idx(h, "valor (em r$)"),
      installment: idx(h, "parcela"),
      cardholder: idx(h, "nome no cartao"),
      dateFormat: "dmy",
      invert: true,
    }),
  },
  {
    name: "Inter (extrato)",
    match: (h) => h.some((x) => x.startsWith("data lancamento")) && h.includes("historico"),
    mapping: (h) => ({ date: idx(h, "data lancamento"), description: idx(h, "descricao", "historico"), amount: idx(h, "valor"), dateFormat: "dmy", invert: false }),
  },
  {
    name: "Inter (fatura do cartão)",
    match: (h) => h.includes("data") && h.includes("lancamento") && h.includes("tipo") && h.some((x) => x.startsWith("valor")),
    mapping: (h) => ({ date: h.indexOf("data"), description: h.indexOf("lancamento"), amount: idx(h, "valor"), dateFormat: "dmy", invert: true }),
  },
  {
    name: "Mercado Pago / PicPay (extrato)",
    match: (h) => h.includes("release_date") || h.includes("transaction_net_amount"),
    mapping: (h) => ({ date: idx(h, "release_date"), description: idx(h, "transaction_type"), amount: idx(h, "transaction_net_amount"), dateFormat: "dmy", invert: false }),
  },
];

/** Adivinha o mapeamento pelo nome das colunas e pelo conteúdo. */
export function guessMapping(table: CsvTable): { mapping: CsvMapping; preset: string | null } {
  const h = table.headers.map(norm);
  const base: CsvMapping = {
    date: -1,
    description: -1,
    amount: null,
    debit: null,
    credit: null,
    installment: null,
    cardholder: null,
    dateFormat: "dmy",
    invert: false,
    headerRow: table.headerRow,
  };
  const preset = PRESETS.find((p) => p.match(h));
  if (preset) {
    const m = { ...base, ...preset.mapping(h) };
    for (const k of ["installment", "cardholder", "amount"] as const) if (m[k] === -1) m[k] = null;
    if (m.date >= 0 && m.description >= 0) return { mapping: m, preset: preset.name };
  }

  const m = { ...base };
  m.date = idx(h, "data de compra", "data lancamento", "data da transacao", "data", "date", "dt");
  m.description = idx(h, "descricao", "historico", "estabelecimento", "lancamento", "title", "memo", "detalhe");
  const debit = idx(h, "debito", "saida");
  const credit = idx(h, "credito", "entrada");
  const amount = idx(h, "valor (em r$)", "valor r$", "valor", "amount", "value", "quantia");
  if (amount >= 0) m.amount = amount;
  else if (debit >= 0 || credit >= 0) {
    m.debit = debit >= 0 ? debit : null;
    m.credit = credit >= 0 ? credit : null;
  }
  const inst = idx(h, "parcela", "parcelas", "installment");
  m.installment = inst >= 0 ? inst : null;
  const holder = idx(h, "nome no cartao", "portador", "titular", "cartao");
  m.cardholder = holder >= 0 && holder !== m.description ? holder : null;

  // Pelo conteúdo, se o nome não ajudou
  const sample = table.rows.slice(0, 20);
  const colScore = (test: (s: string) => boolean) =>
    table.headers.map((_, i) => sample.filter((r) => r[i] && test(r[i])).length);
  if (m.date < 0) {
    const s = colScore(isDateLike);
    m.date = s.indexOf(Math.max(...s));
  }
  if (m.amount === null && m.debit === null && m.credit === null) {
    const s = colScore(isMoneyLike).map((v, i) => (i === m.date ? -1 : v));
    m.amount = s.indexOf(Math.max(...s));
  }
  if (m.description < 0) {
    const lens = table.headers.map((_, i) =>
      i === m.date || i === m.amount ? -1 : sample.reduce((a, r) => a + (r[i]?.length ?? 0), 0),
    );
    m.description = lens.indexOf(Math.max(...lens));
  }
  const dates = sample.map((r) => r[m.date]).filter(Boolean);
  if (dates.some((d) => /^\d{4}-/.test(d))) m.dateFormat = "ymd";
  return { mapping: m, preset: null };
}

const MONTHS: Record<string, number> = { jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12 };

export function parseCsvDate(raw: string, format: CsvMapping["dateFormat"], fallbackYear?: number): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  const named = s.match(/^(\d{1,2})\s+([a-zç]{3})[a-z]*\.?(?:\s+(\d{2,4}))?/i);
  const parts = s.match(/^(\d{1,4})[/.-](\d{1,2})(?:[/.-](\d{1,4}))?/);
  if (named) {
    d = Number(named[1]);
    m = MONTHS[norm(named[2])] ?? 0;
    y = named[3] ? Number(named[3]) : (fallbackYear ?? new Date().getFullYear());
  } else if (parts) {
    const [a, b, c] = [Number(parts[1]), Number(parts[2]), parts[3] ? Number(parts[3]) : undefined];
    if (format === "ymd" || parts[1].length === 4) [y, m, d] = [a, b, c ?? 1];
    else if (format === "mdy") [m, d, y] = [a, b, c ?? fallbackYear ?? new Date().getFullYear()];
    else [d, m, y] = [a, b, c ?? fallbackYear ?? new Date().getFullYear()];
  } else return null;
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!m || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Valor BR/US: "1.234,56", "-1234.56", "(10,00)", "R$ 10,00", "10,00 D" */
export function parseCsvAmount(raw: string): number | null {
  let s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;
  let sign = 1;
  if (/\bD$/i.test(s)) {
    sign = -1;
    s = s.replace(/\s*D$/i, "");
  } else if (/\bC$/i.test(s)) s = s.replace(/\s*C$/i, "");
  s = s.replace(/R\$|US\$|\$/gi, "").replace(/\s/g, "");
  if (/^\(.*\)$/.test(s)) {
    sign = -sign;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    sign = -sign;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) {
    sign = -sign;
    s = s.slice(0, -1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart = s;
  let frac = "";
  if (lastComma > lastDot) {
    intPart = s.slice(0, lastComma).replace(/\./g, "");
    frac = s.slice(lastComma + 1);
  } else if (lastDot > lastComma) {
    const tail = s.slice(lastDot + 1);
    // "1.234" sem vírgula: milhar se tiver exatamente 3 dígitos e houver vírgula ausente e múltiplos pontos ou valor inteiro
    if (lastComma === -1 && tail.length === 3 && s.split(".").length > 2) {
      intPart = s.replace(/\./g, "");
    } else {
      intPart = s.slice(0, lastDot).replace(/,/g, "");
      frac = tail;
    }
  }
  if (!/^\d+$/.test(intPart || "0") || !/^\d*$/.test(frac)) return null;
  return sign * (Number(intPart || "0") * 100 + Math.round(Number(`0.${frac || "0"}`) * 100));
}

export type CsvParsed = { transactions: (ParsedTransaction & { installment: string | null; cardholder: string | null })[]; skipped: number };

/** Aplica um mapeamento à tabela e devolve lançamentos normalizados. */
export function applyMapping(table: CsvTable, m: CsvMapping, fallbackYear?: number): CsvParsed {
  const transactions: CsvParsed["transactions"] = [];
  let skipped = 0;
  for (const r of table.rows) {
    const date = parseCsvDate(r[m.date] ?? "", m.dateFormat, fallbackYear);
    let amount: number | null = null;
    if (m.amount !== null) amount = parseCsvAmount(r[m.amount] ?? "");
    else {
      const d = m.debit !== null ? parseCsvAmount(r[m.debit] ?? "") : null;
      const c = m.credit !== null ? parseCsvAmount(r[m.credit] ?? "") : null;
      if (d) amount = -Math.abs(d);
      else if (c) amount = Math.abs(c);
    }
    const description = (r[m.description] ?? "").replace(/\s+/g, " ").trim();
    // Linhas de saldo/total não são lançamentos
    if (!date || amount === null || amount === 0 || /^(saldo|total|subtotal)\b/i.test(description)) {
      skipped++;
      continue;
    }
    transactions.push({
      externalId: null,
      date,
      amountCents: m.invert ? -amount : amount,
      description: description || "Sem descrição",
      kind: null,
      checkNum: null,
      refNum: null,
      installment: m.installment !== null ? r[m.installment] || null : null,
      cardholder: m.cardholder !== null ? r[m.cardholder] || null : null,
    });
  }
  return { transactions, skipped };
}
