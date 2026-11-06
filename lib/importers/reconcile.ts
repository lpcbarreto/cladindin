import { MATCH_RULES, similarity } from "./match";

export type StatementLine = { id: string; accountId: string; date: string; amountCents: number; description: string };
export type PlannedItem = { id: string; accountId: string; date: string; amountCents: number; description: string };
export type Suggestion = { line: StatementLine; planned: PlannedItem | null; confidence: "high" | "medium" | null };

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

/**
 * Para cada linha do extrato, procura o lançamento previsto que melhor combina na mesma conta:
 * mesmo sinal, data até 7 dias e valor até 10% diferente. Confiança alta quando o valor é igual e
 * (a data está a até 3 dias ou o nome parece). Cada previsto é usado uma vez só.
 */
export function suggestMatches(lines: StatementLine[], planned: PlannedItem[]): Suggestion[] {
  const used = new Set<string>();
  const scored = lines.map((line) => {
    let best: { p: PlannedItem; score: number; exact: boolean; close: boolean } | null = null;
    for (const p of planned) {
      if (p.accountId !== line.accountId || Math.sign(p.amountCents) !== Math.sign(line.amountCents)) continue;
      const days = daysBetween(p.date, line.date);
      if (days > MATCH_RULES.plannedMaxDays) continue;
      const diff = Math.abs(Math.abs(p.amountCents) - Math.abs(line.amountCents)) / Math.abs(p.amountCents || 1);
      if (diff > MATCH_RULES.plannedAmountTolerance) continue;
      const sim = similarity(p.description, line.description);
      const score = (1 - diff) * 2 + (1 - days / MATCH_RULES.plannedMaxDays) + sim * 1.5;
      if (!best || score > best.score) best = { p, score, exact: diff === 0, close: days <= 3 || sim >= 0.34 };
    }
    return { line, best };
  });
  // Melhores pontuações escolhem primeiro
  const order = [...scored].sort((a, b) => (b.best?.score ?? -1) - (a.best?.score ?? -1));
  const chosen = new Map<string, Suggestion>();
  for (const { line, best } of order) {
    if (best && !used.has(best.p.id)) {
      used.add(best.p.id);
      chosen.set(line.id, { line, planned: best.p, confidence: best.exact && best.close ? "high" : "medium" });
    } else chosen.set(line.id, { line, planned: null, confidence: null });
  }
  return lines.map((l) => chosen.get(l.id)!);
}
