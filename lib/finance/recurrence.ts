import { adjustToBusinessDay, isBusinessDay } from "./holidays";

export type Frequency = "daily" | "weekly" | "biweekly" | "monthly" | "bimonthly" | "quarterly" | "semiannual" | "yearly";

export type RecurrenceRule = {
  frequency: Frequency;
  /** A cada N períodos (ex.: a cada 2 meses com frequency=monthly). */
  interval: number;
  /** Para frequências mensais ou maiores: dia fixo, último dia ou N-ésimo dia útil. */
  dayMode: "fixed" | "last" | "business";
  day: number;
  startDate: string;
  endMode: "never" | "until" | "count";
  untilDate: string | null;
  count: number | null;
  /** Ajuste quando cair em fim de semana/feriado. */
  adjust: "none" | "before" | "after";
};

export type Occurrence = {
  /** Data-base (chave estável da ocorrência, sem ajuste de dia útil). */
  key: string;
  /** Data de vencimento já ajustada. */
  date: string;
  index: number;
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: "Diária",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  yearly: "Anual",
};

const MONTHS_STEP: Partial<Record<Frequency, number>> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12 };
const DAYS_STEP: Partial<Record<Frequency, number>> = { daily: 1, weekly: 7, biweekly: 14 };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T12:00:00Z`);

function lastDay(y: number, m: number) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

function nthBusinessDay(y: number, m: number, n: number): string {
  let count = 0;
  for (let d = 1; d <= lastDay(y, m); d++) {
    const s = iso(new Date(Date.UTC(y, m, d, 12)));
    if (isBusinessDay(s) && ++count === n) return s;
  }
  // Mês sem N dias úteis: último dia útil
  return adjustToBusinessDay(iso(new Date(Date.UTC(y, m, lastDay(y, m), 12))), "before");
}

/** Data-base da ocorrência de índice n (0 = primeira). */
export function baseDate(rule: RecurrenceRule, n: number): string {
  const start = utc(rule.startDate);
  const days = DAYS_STEP[rule.frequency];
  if (days) return iso(new Date(start.getTime() + n * days * rule.interval * 86_400_000));
  const step = (MONTHS_STEP[rule.frequency] ?? 1) * rule.interval * n;
  const y = start.getUTCFullYear() + Math.floor((start.getUTCMonth() + step) / 12);
  const m = (start.getUTCMonth() + step) % 12;
  if (rule.dayMode === "last") return iso(new Date(Date.UTC(y, m, lastDay(y, m), 12)));
  if (rule.dayMode === "business") return nthBusinessDay(y, m, Math.max(1, rule.day));
  return iso(new Date(Date.UTC(y, m, Math.min(rule.day, lastDay(y, m)), 12)));
}

/**
 * Ocorrências com vencimento entre from e to (inclusive), respeitando início, término
 * (data ou quantidade) e ajuste de dia útil. Determinística: mesma regra → mesmas chaves.
 */
export function occurrences(rule: RecurrenceRule, from: string, to: string, max = 1000): Occurrence[] {
  const out: Occurrence[] = [];
  let produced = 0; // ocorrências válidas desde o início (para o término por quantidade)
  for (let n = 0; n < 5000 && out.length < max; n++) {
    const key = baseDate(rule, n);
    // Ex.: início dia 19 e vencimento dia 10 → a primeira ocorrência é no mês seguinte
    if (key < rule.startDate) continue;
    if (rule.endMode === "count" && rule.count !== null && produced >= rule.count) break;
    if (rule.endMode === "until" && rule.untilDate && key > rule.untilDate) break;
    produced++;
    const date = rule.dayMode === "business" ? key : adjustToBusinessDay(key, rule.adjust);
    if (date > to && key > to) break;
    if (date >= from && date <= to) out.push({ key, date, index: produced - 1 });
  }
  return out;
}

/** Texto curto: "Mensal, todo dia 10", "A cada 2 semanas", "Mensal, 5º dia útil". */
export function describeRule(rule: RecurrenceRule): string {
  const every = rule.interval > 1;
  const unit: Record<Frequency, [string, string]> = {
    daily: ["Diária", "dias"],
    weekly: ["Semanal", "semanas"],
    biweekly: ["Quinzenal", "quinzenas"],
    monthly: ["Mensal", "meses"],
    bimonthly: ["Bimestral", "bimestres"],
    quarterly: ["Trimestral", "trimestres"],
    semiannual: ["Semestral", "semestres"],
    yearly: ["Anual", "anos"],
  };
  const base = every ? `A cada ${rule.interval} ${unit[rule.frequency][1]}` : unit[rule.frequency][0];
  if (DAYS_STEP[rule.frequency]) return base;
  const when = rule.dayMode === "last" ? "último dia do mês" : rule.dayMode === "business" ? `${rule.day}º dia útil` : `dia ${rule.day}`;
  return `${base}, ${when}`;
}
