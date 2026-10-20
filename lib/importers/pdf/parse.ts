import { parseCsvAmount, parseCsvDate } from "../csv/parse";
import { ImportError, type ParsedTransaction } from "../types";

export type PdfInvoice = {
  transactions: (ParsedTransaction & { installment: string | null; cardholder: string | null })[];
  dueDate: string | null;
  totalCents: number | null;
  skippedLines: number;
};

const MONEY = String.raw`-?\s?(?:R\$\s?)?\d{1,3}(?:\.\d{3})*,\d{2}-?`;
// "20/09 LOJA EXEMPLO 03/10 300,00" ou "20/09/2026 LOJA ... R$ 300,00" ou "20 SET LOJA ... 300,00"
const LINE = new RegExp(String.raw`^(\d{2}\/\d{2}(?:\/\d{2,4})?|\d{2}\s+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ))\s+(.+?)\s+(${MONEY})$`, "i");
const DUE = /vencimento[^\d]{0,30}(\d{2}\/\d{2}\/\d{2,4})/i;
const TOTAL = new RegExp(String.raw`total\s+(?:desta\s+fatura|da\s+fatura|a\s+pagar)[^\d-]{0,30}(${MONEY})`, "i");
const IGNORE = /^(saldo|total|subtotal|pagamento minimo|limite|encargos|juros do rotativo previsto)/i;

/**
 * Lê o texto de uma fatura em PDF linha a linha. Layouts variam muito entre emissores;
 * este parser cobre o padrão "data descrição valor" comum à maioria das faturas BR.
 */
export function parseInvoiceText(text: string): PdfInvoice {
  const due = text.match(DUE)?.[1] ?? null;
  const dueDate = due ? parseCsvDate(due, "dmy") : null;
  const total = text.match(TOTAL)?.[1];
  const totalCents = total ? Math.abs(parseCsvAmount(total) ?? 0) || null : null;
  const year = dueDate ? Number(dueDate.slice(0, 4)) : new Date().getFullYear();
  const dueMonth = dueDate ? Number(dueDate.slice(5, 7)) : 12;

  const transactions: PdfInvoice["transactions"] = [];
  let skippedLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    const m = line.match(LINE);
    if (!m) continue;
    const [, dateRaw, descRaw, amountRaw] = m;
    // Compras sem ano: se o mês é posterior ao do vencimento, é do ano anterior (fatura de janeiro com compras de dezembro)
    let date = parseCsvDate(dateRaw, "dmy", year);
    const hasYear = (dateRaw.match(/\//g) ?? []).length === 2;
    if (date && !hasYear && Number(date.slice(5, 7)) > dueMonth) {
      date = parseCsvDate(dateRaw, "dmy", year - 1);
    }
    const amount = parseCsvAmount(amountRaw);
    const description = descRaw.trim();
    if (!date || amount === null || amount === 0 || IGNORE.test(description)) {
      skippedLines++;
      continue;
    }
    // Na fatura, compras vêm positivas e créditos/pagamentos negativos: invertemos para o padrão do sistema
    transactions.push({
      externalId: null,
      date,
      amountCents: -amount,
      description,
      kind: null,
      checkNum: null,
      refNum: null,
      installment: null,
      cardholder: null,
    });
  }
  return { transactions, dueDate, totalCents, skippedLines };
}

/** Texto do PDF. Sem texto (PDF escaneado/foto) ou com senha, avisa o que fazer. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  let text: string;
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const res = await extractText(pdf, { mergePages: true });
    text = Array.isArray(res.text) ? res.text.join("\n") : res.text;
  } catch {
    throw new ImportError(
      "Não foi possível ler o PDF (pode estar protegido por senha).",
      "Remova a senha (salvando uma cópia sem senha) ou baixe o arquivo em OFX/CSV no app do banco.",
    );
  }
  if (text.replace(/\s/g, "").length < 30) {
    throw new ImportError(
      "Este PDF é uma imagem escaneada: não tem texto para ler.",
      "Baixe o extrato/fatura direto do app do banco (PDF original, OFX ou CSV). Para guardar um comprovante escaneado, anexe-o no lançamento.",
    );
  }
  return text;
}

export function parseInvoiceOrThrow(text: string): PdfInvoice {
  const parsed = parseInvoiceText(text);
  if (!parsed.transactions.length) {
    throw new ImportError(
      "Não reconhecemos lançamentos neste PDF.",
      "O layout desta fatura ainda não é suportado. Baixe a fatura em CSV ou OFX no app do banco e importe por aqui.",
    );
  }
  return parsed;
}

/** Fatura de cartão: fala em fatura e tem vencimento. */
export function looksLikeInvoice(text: string) {
  return /fatura/i.test(text) && DUE.test(text);
}
