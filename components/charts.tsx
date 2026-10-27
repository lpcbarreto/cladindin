// Gráficos leves: HTML + SVG gerados no servidor, sem biblioteca no navegador.
// Só a camada de hover (ChartHover, ~1 kB) roda no cliente.
import { ChartHover } from "@/components/chart-hover";

export { PrintButton } from "@/components/print-button";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const money = (cents: number) => brl.format(cents / 100);
const axisMoney = (cents: number) => `R$ ${compact.format(cents / 100)}`;
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 1))).replace(".", "") + `/${String(y).slice(2)}`;
};
const tip = (t: string, r: [string, string, number][]) => JSON.stringify({ t, r: r.map(([c, n, v]) => [c, n, money(v)]) });

/** Escala "redonda" do eixo (1, 2, 2,5 ou 5 × 10ⁿ), incluindo o zero; sem dados abre R$ 0–100. */
export function niceScale(min: number, max: number, ticks = 4) {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (lo === hi) hi = lo + 10000;
  const raw = (hi - lo) / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const values: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) values.push(Math.round(v));
  return { lo, hi, values, pct: (v: number) => ((v - lo) / (hi - lo)) * 100 };
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-muted" aria-label="Legenda">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Eixo Y (HTML, texto nítido em qualquer largura) + linhas de grade. */
function YAxis({ scale }: { scale: ReturnType<typeof niceScale> }) {
  return (
    <>
      {scale.values.map((v) => (
        <div key={v} className="pointer-events-none absolute right-0 left-0 flex items-center" style={{ bottom: `${scale.pct(v)}%`, transform: "translateY(50%)" }}>
          <span className="w-16 shrink-0 pr-2 text-right text-[11px] text-muted tabular-nums">{axisMoney(v)}</span>
          <span className={`h-px flex-1 ${v === 0 ? "bg-muted/50" : "bg-border"}`} />
        </div>
      ))}
    </>
  );
}

/** Receitas × despesas por mês (barras agrupadas, um único eixo). */
export function FlowChart({ data }: { data: { month: string; income: number; expense: number }[] }) {
  const scale = niceScale(0, Math.max(0, ...data.flatMap((d) => [d.income, d.expense])));
  const series = [
    { key: "income" as const, label: "Receitas", color: "var(--series-income)" },
    { key: "expense" as const, label: "Despesas", color: "var(--series-expense)" },
  ];
  return (
    <div className="space-y-2">
      <Legend items={series} />
      <ChartHover className="h-72">
        <div role="img" aria-label="Gráfico de receitas e despesas por mês; os valores estão na tabela abaixo" className="absolute inset-0 bottom-6">
          <YAxis scale={scale} />
          <div className="absolute inset-y-0 right-0 left-16 flex">
            {data.map((d) => (
              <div
                key={d.month}
                className="group flex h-full flex-1 items-end justify-center gap-0.5 rounded-lg px-1 hover:bg-surface-2/60"
                data-tip={tip(monthLabel(d.month), series.map((s) => [s.color, s.label, d[s.key]]))}
              >
                {series.map((s) => (
                  <span
                    key={s.key}
                    className="bar-rise block rounded-t"
                    style={{ height: `${scale.pct(d[s.key])}%`, width: "40%", maxWidth: 28, background: s.color, minHeight: d[s.key] ? 2 : 0 }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="absolute right-0 bottom-0 left-16 flex text-[11px] text-muted">
          {data.map((d) => (
            <span key={d.month} className="flex-1 text-center">
              {monthLabel(d.month)}
            </span>
          ))}
        </div>
      </ChartHover>
    </div>
  );
}

/** Evolução do saldo (série única: o título nomeia, sem legenda). */
export function BalanceChart({ data, zeroLine = false }: { data: { date: string; balance: number }[]; zeroLine?: boolean }) {
  const values = data.map((d) => d.balance);
  const scale = niceScale(Math.min(0, ...values), Math.max(0, ...values));
  const n = Math.max(1, data.length - 1);
  const points = data.map((d, i) => `${(i / n) * 1000},${1000 - scale.pct(d.balance) * 10}`).join(" ");
  const fmt = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
  // Até ~6 rótulos no eixo X, igualmente espaçados
  const every = Math.max(1, Math.ceil(data.length / 6));
  // Faixas de hover: no máximo ~120, agrupando dias em listas longas
  const step = Math.max(1, Math.ceil(data.length / 120));
  const slots = data.filter((_, i) => i % step === 0 || i === data.length - 1);
  return (
    <ChartHover className="h-72">
      <div role="img" aria-label="Gráfico da evolução do saldo; os valores estão na tabela abaixo" className="absolute inset-0 bottom-6">
        <YAxis scale={scale} />
        <div className="absolute inset-y-0 right-0 left-16">
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {zeroLine && scale.lo < 0 && (
              <line x1="0" x2="1000" y1={1000 - scale.pct(0) * 10} y2={1000 - scale.pct(0) * 10} stroke="var(--danger)" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
            )}
            <polyline
              points={points}
              fill="none"
              stroke="var(--series-balance)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="absolute inset-0 flex">
            {slots.map((d) => (
              <div
                key={d.date}
                className="h-full flex-1 hover:bg-[linear-gradient(to_right,transparent_calc(50%-0.5px),var(--muted)_calc(50%-0.5px),var(--muted)_calc(50%+0.5px),transparent_calc(50%+0.5px))]"
                data-tip={tip(d.date.split("-").reverse().join("/"), [["var(--series-balance)", "Saldo", d.balance]])}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="absolute right-0 bottom-0 left-16 h-4 text-[11px] text-muted">
        {data.map((d, i) =>
          i % every === 0 ? (
            <span key={d.date} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(i / n) * 100}%` }}>
              {fmt(d.date)}
            </span>
          ) : null,
        )}
      </div>
    </ChartHover>
  );
}

/** Ranking horizontal (uma série, cor da natureza: receita ou despesa). */
export function RankChart({ data, kind }: { data: { name: string; total: number }[]; kind: "income" | "expense" }) {
  const color = kind === "income" ? "var(--series-income)" : "var(--series-expense)";
  const label = kind === "income" ? "Receitas" : "Despesas";
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <ChartHover>
      <ul role="img" aria-label="Gráfico de barras por grupo; os valores estão na lista ao lado" className="space-y-2">
        {data.map((d) => (
          <li key={d.name} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-xs" data-tip={tip(d.name, [[color, label, d.total]])}>
            <span className="truncate text-right text-foreground">{d.name}</span>
            <span className="flex h-6 items-center rounded-md hover:bg-surface-2/60">
              <span className="bar-grow block h-4 rounded-r" style={{ width: `${Math.max(1, (d.total / max) * 100)}%`, background: color }} />
            </span>
          </li>
        ))}
      </ul>
    </ChartHover>
  );
}
