import { normalizeDescription } from "@/lib/importers/normalize";

export type InstallmentInfo = { number: number; total: number; base: string };

const PATTERNS = [
  /\bPARC(?:ELA)?\.?\s*(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\b/i, // PARC 3/10, PARCELA 03 DE 10
  /\b(\d{1,2})\s*DE\s*(\d{1,2})\b/i, // 3 de 10
  /(?:^|\s|\()(\d{1,2})\/(\d{1,2})(?:\)|\s|$)/, // 03/10 (sem ano)
];

/**
 * Detecta parcela na descrição ("LOJA 03/10", "PARC 3/10", "3 de 10").
 * Rejeita datas (dd/mm): exige parcela <= total e total entre 2 e 99.
 */
export function detectInstallment(description: string, explicit?: string | null): InstallmentInfo | null {
  const sources = explicit ? [explicit, description] : [description];
  for (const src of sources) {
    for (const re of PATTERNS) {
      const m = src.match(re);
      if (!m) continue;
      const n = Number(m[1]);
      const t = Number(m[2]);
      if (n >= 1 && t >= 2 && t <= 99 && n <= t) {
        const base = normalizeDescription(description.replace(m[0], " ")).trim();
        return { number: n, total: t, base };
      }
    }
  }
  return null;
}

/** Divide um total em N parcelas iguais em centavos; a diferença vai na última. */
export function splitInstallments(totalCents: number, count: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error("Total inválido");
  if (!Number.isInteger(count) || count < 1) throw new Error("Número de parcelas inválido");
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? totalCents - base * (count - 1) : base));
}

/** Fechamento e vencimento da fatura de uma compra (espelha invoice_dates_for_purchase no banco). */
export function invoiceDatesForPurchase(closingDay: number, dueDay: number, date: string) {
  const dayIn = (y: number, m: number, d: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(d, last)));
  };
  const p = new Date(`${date}T00:00:00Z`);
  let closing = dayIn(p.getUTCFullYear(), p.getUTCMonth(), closingDay);
  if (p >= closing) closing = dayIn(p.getUTCFullYear(), p.getUTCMonth() + 1, closingDay);
  const due =
    dueDay > closingDay
      ? dayIn(closing.getUTCFullYear(), closing.getUTCMonth(), dueDay)
      : dayIn(closing.getUTCFullYear(), closing.getUTCMonth() + 1, dueDay);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { closingDate: iso(closing), dueDate: iso(due) };
}
