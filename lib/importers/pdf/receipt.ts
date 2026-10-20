import { parseCsvAmount } from "../csv/parse";

export type PdfReceipt = {
  kind: "Pix" | "Boleto" | "Transferência" | "Pagamento";
  direction: "in" | "out";
  amountCents: number;
  date: string;
  counterparty: string | null;
  /** Descrição pronta, ex.: "Pix para Maria Silva". */
  description: string;
};

const MONEY = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;
const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Parece comprovante: título de comprovante/recibo e no máximo um ou dois valores com data na frente. */
export function looksLikeReceipt(text: string) {
  const t = fold(text);
  if (!/comprovante|recibo|transacao efetuada|pagamento efetuado|pix (enviado|realizado|recebido)|transferencia (realizada|enviada|recebida)/.test(t)) return false;
  const datedLines = text.split(/\r?\n/).filter((l) => /^\s*\d{2}\/\d{2}(\/\d{2,4})?\s+\S.*\d,\d{2}\s*[-DC]?\s*$/i.test(l)).length;
  return datedLines <= 2;
}

function findDate(text: string): string | null {
  const t = fold(text);
  // Data perto de "data", "realizado em", "pago em"...
  const near = t.match(/(?:data(?: da transacao| do pagamento| de pagamento| da transferencia)?|realizad[oa] em|pago em|efetuad[oa] em|em)\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const any = near ?? t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (any) return `${any[3]}-${any[2]}-${any[1]}`;
  const ext = t.match(/(\d{1,2})\s+(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s+(?:de\s+)?(\d{4})/);
  if (ext) return `${ext[3]}-${String(MONTHS[ext[2]]).padStart(2, "0")}-${ext[1].padStart(2, "0")}`;
  return null;
}

function findAmount(text: string): number | null {
  const labeled = text.match(
    new RegExp(String.raw`valor(?:\s+(?:pago|do pagamento|da transfer[eê]ncia|total|cobrado|do pix|enviado|recebido|do documento))?\s*:?\s*(?:R\$\s*)?(${MONEY})`, "i"),
  );
  const any = labeled ?? text.match(new RegExp(String.raw`R\$\s*(${MONEY})`));
  if (!any) return null;
  const v = parseCsvAmount(any[1]);
  return v ? Math.abs(v) : null;
}

const LABEL = /^(nome|cpf|cnpj|chave|institui[cç][aã]o|banco|ag[eê]ncia|conta|tipo|data|valor|id|autentica|c[oó]digo|documento)\b/i;

function findCounterparty(text: string, direction: "in" | "out"): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const heads =
    direction === "out"
      ? /^(destino|dados do recebedor|recebedor|favorecido|benefici[aá]rio|para|quem recebeu|destinat[aá]rio|pago para)\b/i
      : /^(origem|dados do pagador|pagador|quem pagou|remetente|de|enviado por)\b/i;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(heads);
    if (!m) continue;
    // Nome na mesma linha: "Recebedor: Maria Silva" ou "Para Maria Silva"
    const inline = lines[i].slice(m[0].length).replace(/^\s*:?\s*(nome\s*:?\s*)?/i, "").trim();
    if (inline.length >= 3 && /[a-zà-ú]{2}/i.test(inline) && !LABEL.test(inline)) return clean(inline);
    for (const next of lines.slice(i + 1, i + 7)) {
      const named = next.match(/^nome\s*:?\s*(.+)$/i);
      if (named) return clean(named[1]);
      if (!LABEL.test(next) && /^[A-Za-zÀ-ú][A-Za-zÀ-ú .'&-]{2,}$/.test(next)) return clean(next);
    }
  }
  return null;
}

const clean = (s: string) =>
  s
    .replace(/\s+(cpf|cnpj)\b.*$/i, "")
    .replace(/[*•]+/g, "")
    .trim()
    .slice(0, 80)
    .replace(/\b([A-ZÀ-Ú])([A-ZÀ-Ú]+)\b/g, (_, a: string, b: string) => a + b.toLowerCase());

/** Lê comprovante de Pix, boleto ou transferência (PDF com texto). */
export function parseReceiptText(text: string): PdfReceipt | null {
  const t = fold(text);
  const amountCents = findAmount(text);
  const date = findDate(text);
  if (!amountCents || !date) return null;
  const kind: PdfReceipt["kind"] = /\bpix\b/.test(t)
    ? "Pix"
    : /boleto|linha digitavel|codigo de barras/.test(t)
      ? "Boleto"
      : /\bted\b|\bdoc\b|transferencia/.test(t)
        ? "Transferência"
        : "Pagamento";
  const direction = /(pix|transferencia|ted|deposito)\s+recebid|voce recebeu|credito recebido|comprovante de recebimento/.test(t) ? "in" : "out";
  const counterparty = findCounterparty(text, direction);
  const description = counterparty
    ? `${kind} ${direction === "in" ? "de" : kind === "Boleto" ? "–" : "para"} ${counterparty}`
    : `${kind} ${direction === "in" ? "recebido" : kind === "Boleto" ? "pago" : "enviado"}`;
  return { kind, direction, amountCents, date, counterparty, description };
}
