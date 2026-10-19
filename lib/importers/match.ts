import { normalizeDescription } from "./normalize";

export type IncomingRow = {
  index: number;
  date: string;
  amountCents: number; // com sinal
  description: string;
  externalId: string | null;
  fingerprint: string;
};

export type ExistingTx = {
  id: string;
  date: string; // vencimento (previsto) ou pagamento (pago)
  amountCents: number; // com sinal
  description: string;
  status: "planned" | "paid" | "cancelled";
  externalId: string | null;
  fingerprint: string | null;
  origin: string;
};

export type RowStatus =
  | { kind: "new" }
  | { kind: "imported"; txId: string } // já existe (mesmo FITID ou fingerprint)
  | { kind: "duplicate"; txId: string } // parece um lançamento manual já pago
  | { kind: "reconcile"; txId: string; description: string; date: string; amountCents: number }; // casa com um previsto

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

/** Similaridade simples por palavras (Jaccard) das descrições normalizadas. */
export function similarity(a: string, b: string) {
  const wa = new Set(normalizeDescription(a).split(" ").filter((w) => w.length > 2));
  const wb = new Set(normalizeDescription(b).split(" ").filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  const inter = [...wa].filter((w) => wb.has(w)).length;
  return inter / (wa.size + wb.size - inter);
}

export const MATCH_RULES = {
  /** Previsto aceita valor até 10% diferente (contas com valor variável, como luz). */
  plannedAmountTolerance: 0.1,
  plannedMaxDays: 7,
  duplicateMaxDays: 2,
};

/**
 * Classifica cada linha importada contra os lançamentos da conta:
 * 1. mesmo FITID ou mesmo fingerprint → já importado (nunca duplica)
 * 2. previsto com valor e data próximos → sugerir conciliação
 * 3. pago manualmente com mesmo valor e data próxima → possível duplicado
 * 4. senão → novo
 * Cada lançamento existente é usado no máximo uma vez.
 */
export function classifyRows(rows: IncomingRow[], existing: ExistingTx[]): Map<number, RowStatus> {
  const result = new Map<number, RowStatus>();
  const used = new Set<string>();
  const byExternal = new Map(existing.filter((e) => e.externalId).map((e) => [e.externalId!, e]));
  const byFingerprint = new Map(existing.filter((e) => e.fingerprint).map((e) => [e.fingerprint!, e]));

  for (const r of rows) {
    const hit = (r.externalId && byExternal.get(r.externalId)) || byFingerprint.get(r.fingerprint);
    if (hit) {
      used.add(hit.id);
      result.set(r.index, { kind: "imported", txId: hit.id });
    }
  }

  const candidates = existing.filter((e) => e.status !== "cancelled" && !e.externalId && !e.fingerprint);
  const pending = rows.filter((r) => !result.has(r.index));

  // Conciliação: escolhe o melhor previsto por (distância de valor, de data, descrição)
  for (const r of pending) {
    let best: { tx: ExistingTx; score: number } | null = null;
    for (const e of candidates) {
      if (used.has(e.id) || e.status !== "planned") continue;
      if (Math.sign(e.amountCents) !== Math.sign(r.amountCents)) continue;
      const amountDiff = Math.abs(Math.abs(e.amountCents) - Math.abs(r.amountCents)) / Math.abs(r.amountCents);
      const days = daysBetween(e.date, r.date);
      if (amountDiff > MATCH_RULES.plannedAmountTolerance || days > MATCH_RULES.plannedMaxDays) continue;
      const score = amountDiff * 10 + days / MATCH_RULES.plannedMaxDays - similarity(e.description, r.description);
      if (!best || score < best.score) best = { tx: e, score };
    }
    if (best) {
      used.add(best.tx.id);
      result.set(r.index, {
        kind: "reconcile",
        txId: best.tx.id,
        description: best.tx.description,
        date: best.tx.date,
        amountCents: best.tx.amountCents,
      });
    }
  }

  for (const r of pending) {
    if (result.has(r.index)) continue;
    const dup = candidates.find(
      (e) =>
        !used.has(e.id) &&
        e.status === "paid" &&
        e.amountCents === r.amountCents &&
        daysBetween(e.date, r.date) <= MATCH_RULES.duplicateMaxDays,
    );
    if (dup) {
      used.add(dup.id);
      result.set(r.index, { kind: "duplicate", txId: dup.id });
    } else result.set(r.index, { kind: "new" });
  }
  return result;
}
