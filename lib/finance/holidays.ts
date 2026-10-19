// Feriados nacionais e bancários do Brasil (sem feriados estaduais/municipais).

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
const cache = new Map<number, Set<string>>();

export function holidays(year: number): Set<string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const e = easter(year);
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];
  if (year >= 2024) fixed.push("11-20"); // Consciência Negra (nacional desde 2024)
  const set = new Set([
    ...fixed.map((md) => `${year}-${md}`),
    iso(shift(e, -48)), // Carnaval (segunda)
    iso(shift(e, -47)), // Carnaval (terça)
    iso(shift(e, -2)), // Sexta-feira Santa
    iso(shift(e, 60)), // Corpus Christi
  ]);
  cache.set(year, set);
  return set;
}

export function isBusinessDay(isoDate: string): boolean {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !holidays(d.getUTCFullYear()).has(isoDate);
}

/** Move para o dia útil anterior ("before") ou seguinte ("after"). */
export function adjustToBusinessDay(isoDate: string, mode: "none" | "before" | "after"): string {
  if (mode === "none") return isoDate;
  let d = new Date(`${isoDate}T12:00:00Z`);
  while (!isBusinessDay(iso(d))) d = shift(d, mode === "before" ? -1 : 1);
  return iso(d);
}
