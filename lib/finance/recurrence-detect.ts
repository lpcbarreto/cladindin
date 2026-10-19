import { normalizeDescription } from "@/lib/importers/normalize";

export type HistoryTx = { accountId: string; description: string; amountCents: number; date: string; categoryId: string | null };

export type RecurrenceSuggestion = {
  key: string;
  accountId: string;
  description: string;
  type: "income" | "expense";
  amountCents: number;
  variable: boolean;
  day: number;
  months: number;
  lastDate: string;
  categoryId: string | null;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * Procura cobranças mensais no histórico: mesma conta e descrição normalizada, em ao menos
 * 3 meses diferentes, com intervalo típico de ~1 mês e valor estável (até 25% de variação,
 * marcada como "variável" acima de 5%).
 */
export function detectRecurring(history: HistoryTx[], ignoreKeys: Set<string> = new Set()): RecurrenceSuggestion[] {
  const groups = new Map<string, HistoryTx[]>();
  for (const t of history) {
    const norm = normalizeDescription(t.description);
    if (norm.length < 3) continue;
    const key = `${t.accountId}|${norm}|${t.amountCents < 0 ? "-" : "+"}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const out: RecurrenceSuggestion[] = [];
  for (const [key, list] of groups) {
    const norm = key.split("|")[1];
    if (ignoreKeys.has(norm)) continue;
    // Um por mês (o maior), para ignorar compras avulsas repetidas no mesmo mês
    const byMonth = new Map<string, HistoryTx>();
    for (const t of list) {
      const m = t.date.slice(0, 7);
      const prev = byMonth.get(m);
      if (!prev || Math.abs(t.amountCents) > Math.abs(prev.amountCents)) byMonth.set(m, t);
    }
    const items = [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (items.length < 3) continue;

    const gaps = items.slice(1).map((t, i) => (Date.parse(t.date) - Date.parse(items[i].date)) / 86_400_000);
    const g = median(gaps);
    if (g < 25 || g > 35) continue;

    const amounts = items.map((t) => Math.abs(t.amountCents));
    const med = median(amounts);
    const spread = (Math.max(...amounts) - Math.min(...amounts)) / med;
    if (spread > 0.25) continue;

    const last = items[items.length - 1];
    out.push({
      key: norm,
      accountId: last.accountId,
      description: last.description,
      type: last.amountCents < 0 ? "expense" : "income",
      amountCents: med,
      variable: spread > 0.05,
      day: median(items.map((t) => Number(t.date.slice(8, 10)))),
      months: items.length,
      lastDate: last.date,
      categoryId: [...items].reverse().find((t) => t.categoryId)?.categoryId ?? null,
    });
  }
  return out.sort((a, b) => b.months - a.months || b.amountCents - a.amountCents);
}
