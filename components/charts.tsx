"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const money = (cents: number) => brl.format(cents / 100);
const axisMoney = (cents: number) => `R$ ${compact.format(cents / 100)}`;
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 1))).replace(".", "") + `/${String(y).slice(2)}`;
};

const axis = { stroke: "var(--muted)", fontSize: 12, tickLine: false, axisLine: false } as const;

function TooltipBox({ active, payload, label, labelFormatter }: TooltipProps<number, string> & { labelFormatter?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-foreground">{labelFormatter ? labelFormatter(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey as string} className="flex items-center gap-2 text-foreground">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
          {p.name}: <b className="tabular-nums">{money(Number(p.value))}</b>
        </p>
      ))}
    </div>
  );
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

/** Receitas × despesas por mês (barras agrupadas, um único eixo). */
export function FlowChart({ data }: { data: { month: string; income: number; expense: number }[] }) {
  return (
    <div className="space-y-2">
      <Legend
        items={[
          { label: "Receitas", color: "var(--series-income)" },
          { label: "Despesas", color: "var(--series-expense)" },
        ]}
      />
      <div className="h-72" role="img" aria-label="Gráfico de receitas e despesas por mês; os valores estão na tabela abaixo">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
            <YAxis tickFormatter={axisMoney} width={72} {...axis} />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<TooltipBox labelFormatter={monthLabel} />} />
            <Bar dataKey="income" name="Receitas" fill="var(--series-income)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expense" name="Despesas" fill="var(--series-expense)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Evolução do saldo (série única: o título nomeia, sem legenda). */
export function BalanceChart({ data, zeroLine = false }: { data: { date: string; balance: number }[]; zeroLine?: boolean }) {
  const fmt = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
  return (
    <div className="h-72" role="img" aria-label="Gráfico da evolução do saldo; os valores estão na tabela abaixo">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={fmt} minTickGap={32} {...axis} />
          <YAxis tickFormatter={axisMoney} width={72} {...axis} />
          <Tooltip content={<TooltipBox labelFormatter={(d) => d.split("-").reverse().join("/")} />} cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} />
          {zeroLine && <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 4" />}
          <Line type="monotone" dataKey="balance" name="Saldo" stroke="var(--series-balance)" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranking horizontal (uma série, cor da natureza: receita ou despesa). */
export function RankChart({ data, kind }: { data: { name: string; total: number }[]; kind: "income" | "expense" }) {
  const color = kind === "income" ? "var(--series-income)" : "var(--series-expense)";
  return (
    <div style={{ height: Math.max(160, data.length * 36) }} role="img" aria-label="Gráfico de barras por grupo; os valores estão na tabela ao lado">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={140} {...axis} tick={{ fill: "var(--foreground)", fontSize: 12 }} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<TooltipBox />} />
          <Bar dataKey="total" name={kind === "income" ? "Receitas" : "Despesas"} fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>
      Imprimir / PDF
    </button>
  );
}
