import Link from "next/link";
import { Icon } from "@/components/icon";
import { loadWorkspaceContext } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { formatDateBR, formatMonthBR, shiftMonth, todayISO } from "@/lib/finance/dates";
import { buildReport, parseReportParams, REPORTS, type ReportKey } from "@/lib/report-data";
import { BalanceChart, FlowChart, PrintButton, RankChart } from "@/components/charts";
import { NavIcon } from "@/components/app-nav";
import { EmptyState } from "@/components/empty-state";

const shortMonth = (m: string) => `${m.slice(5, 7)}/${m.slice(2, 4)}`;

// Cada relatório com um ícone (traço do menu) e o que ele responde
const REPORT_INFO: Record<ReportKey, { icon: string; hint: string }> = {
  fluxo: { icon: "relatorios", hint: "Quanto entrou e saiu por mês" },
  categorias: { icon: "categorias", hint: "Para onde vai o dinheiro" },
  comparativo: { icon: "lancamentos", hint: "Cada categoria mês a mês" },
  dre: { icon: "orcamento", hint: "Resultado da empresa" },
  saldo: { icon: "projecao", hint: "Como o saldo evoluiu" },
};

type Kpi = { label: string; value: number; tone?: "pos" | "neg" | "auto"; note?: string };

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { workspaceId } = await params;
  const sp = await searchParams;
  const p = parseReportParams(sp);
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const [{ data: accounts }, report] = await Promise.all([
    supabase.from("accounts").select("id, name").eq("workspace_id", workspaceId).eq("archived", false).order("name"),
    buildReport(supabase, workspaceId, p),
  ]);
  const qs = (patch: Record<string, string | null>) => {
    const s = new URLSearchParams();
    Object.entries({ ...p, ...patch }).forEach(([k, v]) => v && s.set(k, String(v)));
    return s.toString();
  };
  const base = `/w/${workspaceId}/relatorios`;
  const now = todayISO().slice(0, 7);
  const presets = [
    { label: "3 meses", de: shiftMonth(now, -2), ate: now },
    { label: "6 meses", de: shiftMonth(now, -5), ate: now },
    { label: "12 meses", de: shiftMonth(now, -11), ate: now },
    { label: `Ano ${now.slice(0, 4)}`, de: `${now.slice(0, 4)}-01`, ate: now },
    { label: `Ano ${Number(now.slice(0, 4)) - 1}`, de: `${Number(now.slice(0, 4)) - 1}-01`, ate: `${Number(now.slice(0, 4)) - 1}-12` },
  ];
  const accountName = (accounts ?? []).find((a) => a.id === p.conta)?.name;

  // Números-resumo de cada relatório
  let kpis: Kpi[] = [];
  if (report.kind === "fluxo") {
    const inc = report.rows.reduce((a, r) => a + r.income, 0);
    const exp = report.rows.reduce((a, r) => a + r.expense, 0);
    kpis = [
      { label: "Receitas", value: inc, tone: "pos" },
      { label: "Despesas", value: exp, tone: "neg" },
      { label: "Resultado", value: inc - exp, tone: "auto" },
      { label: "Média mensal", value: Math.round((inc - exp) / Math.max(1, report.rows.length)), tone: "auto", note: `em ${report.rows.length} mês(es)` },
    ];
  } else if (report.kind === "categorias") {
    const total = report.rows.reduce((a, r) => a + r.total, 0);
    const top = report.rows[0];
    kpis = [
      { label: p.tipo === "income" ? "Total recebido" : "Total gasto", value: total, tone: p.tipo === "income" ? "pos" : "neg" },
      ...(top ? [{ label: "Maior grupo", value: top.total, note: `${top.name} · ${Math.round(top.share * 100)}%` }] : []),
      { label: "Média por mês", value: Math.round(total / Math.max(1, monthsCount(p.de, p.ate))) },
    ];
  } else if (report.kind === "comparativo") {
    const totals = report.months.map((_, i) => report.rows.reduce((a, r) => a + (r.values[i] ?? 0), 0));
    const max = Math.max(0, ...totals);
    const maxIdx = totals.indexOf(max);
    kpis = [
      { label: "Total no período", value: totals.reduce((a, b) => a + b, 0), tone: p.tipo === "income" ? "pos" : "neg" },
      { label: "Mês mais alto", value: max, note: maxIdx >= 0 && max > 0 ? formatMonthBR(report.months[maxIdx]) : undefined },
      { label: "Média por mês", value: Math.round(totals.reduce((a, b) => a + b, 0) / Math.max(1, totals.length)) },
    ];
  } else if (report.kind === "dre") {
    const result = report.rows.find((r) => r.kind === "result");
    const gross = report.rows[0];
    kpis = [
      { label: gross?.label ?? "Receita bruta", value: gross?.value ?? 0, tone: "pos" },
      { label: result?.label ?? "Resultado", value: result?.value ?? 0, tone: "auto" },
      ...(gross?.value ? [{ label: "Margem", value: 0, note: `${Math.round(((result?.value ?? 0) / gross.value) * 100)}% da receita` }] : []),
    ];
  } else {
    const first = report.series[0]?.balance ?? 0;
    const last = report.series[report.series.length - 1]?.balance ?? 0;
    const min = report.series.reduce((m, r) => (r.balance < m.balance ? r : m), report.series[0] ?? { date: "", balance: 0 });
    kpis = [
      { label: "Saldo inicial", value: first },
      { label: "Saldo final", value: last, tone: "auto" },
      { label: "Variação", value: last - first, tone: "auto" },
      { label: "Menor saldo", value: min.balance, tone: "auto", note: min.date ? formatDateBR(min.date) : undefined },
    ];
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">{current.name}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Relatórios</h1>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Link href={`${base}/imposto`} className="btn-ghost">
            <Icon name="receipt" size={16} />
            Imposto de Renda
          </Link>
          <a href={`${base}/exportar?${qs({})}`} className="btn-ghost">
            Exportar CSV
          </a>
          <PrintButton />
        </div>
      </div>

      {/* Escolha do relatório: cartões com o que cada um responde */}
      <nav className="no-print -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible" aria-label="Tipo de relatório">
        {(Object.keys(REPORTS) as ReportKey[]).map((k) => {
          const active = p.r === k;
          return (
            <Link
              key={k}
              href={`${base}?${qs({ r: k })}`}
              aria-current={active ? "page" : undefined}
              className={`lift flex min-w-44 items-start gap-3 rounded-2xl border p-3 transition ${
                active ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-primary/40"
              }`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted"}`}>
                <NavIcon name={REPORT_INFO[k].icon} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{REPORTS[k]}</span>
                <span className="block text-xs text-muted">{REPORT_INFO[k].hint}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Filtros numa linha, acima dos gráficos; atalhos de período */}
      <section className="no-print card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Período:</span>
          {presets.map((pr) => {
            const on = pr.de === p.de && pr.ate === p.ate;
            return (
              <Link
                key={pr.label}
                href={`${base}?${qs({ de: pr.de, ate: pr.ate })}`}
                className={`rounded-full px-3 py-1 font-semibold ${on ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-foreground"}`}
              >
                {pr.label}
              </Link>
            );
          })}
        </div>
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <input type="hidden" name="r" value={p.r} />
          <label className="text-muted">
            De
            <input type="month" name="de" defaultValue={p.de} className="input mt-1 w-40" />
          </label>
          <label className="text-muted">
            Até
            <input type="month" name="ate" defaultValue={p.ate} className="input mt-1 w-40" />
          </label>
          {p.r !== "saldo" && (
            <label className="text-muted">
              Regime
              <select name="base" defaultValue={p.base} className="input mt-1">
                <option value="competencia">Competência (data da compra)</option>
                <option value="caixa">Caixa (data do pagamento)</option>
              </select>
            </label>
          )}
          {(p.r === "categorias" || p.r === "comparativo") && (
            <label className="text-muted">
              Natureza
              <select name="tipo" defaultValue={p.tipo} className="input mt-1">
                <option value="expense">Despesas</option>
                <option value="income">Receitas</option>
              </select>
            </label>
          )}
          {p.r === "categorias" && (
            <label className="text-muted">
              Agrupar por
              <select name="dim" defaultValue={p.dim} className="input mt-1">
                <option value="categoria">Categoria</option>
                <option value="contato">Cliente/fornecedor</option>
                <option value="centro">Centro de custo</option>
              </select>
            </label>
          )}
          <label className="text-muted">
            Conta
            <select name="conta" defaultValue={p.conta ?? ""} className="input mt-1">
              <option value="">Todas</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn">Aplicar</button>
        </form>
      </section>

      <p className="text-sm text-muted">
        <b className="text-foreground">{REPORTS[p.r]}</b> · {formatMonthBR(p.de)} a {formatMonthBR(p.ate)}
        {p.r !== "saldo" && ` · regime de ${p.base === "competencia" ? "competência" : "caixa"}`}
        {accountName && ` · conta ${accountName}`}
      </p>

      <div className={`stagger grid gap-3 sm:grid-cols-2 ${kpis.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {kpis.map((k) => (
          <div key={k.label} className="card p-4">
            <p className="text-xs font-semibold text-muted">{k.label}</p>
            {k.label === "Margem" ? (
              <p className="text-xl font-extrabold">{k.note}</p>
            ) : (
              <>
                <p className={`text-xl font-extrabold tabular-nums ${toneClass(k)}`}>{formatBRL(k.value)}</p>
                {k.note && <p className="truncate text-xs text-muted">{k.note}</p>}
              </>
            )}
          </div>
        ))}
      </div>

      {report.kind === "fluxo" &&
        (report.rows.every((r) => !r.income && !r.expense && !r.incomePlanned && !r.expensePlanned) ? (
          <Empty base={workspaceId} />
        ) : (
          <>
            <section className="card">
              <h2 className="mb-3 font-bold">Receitas × despesas realizadas</h2>
              <FlowChart data={report.rows} />
            </section>
            <Table
              head={["Mês", "Receitas", "Despesas", "Resultado", "Receitas previstas", "Despesas previstas", "Resultado previsto"]}
              rows={report.rows.map((r) => [formatMonthBR(r.month), r.income, r.expense, r.net, r.incomePlanned, r.expensePlanned, r.netPlanned])}
              signed={[3, 6]}
              totals
            />
            <p className="text-xs text-muted">Previsto = realizado + lançamentos ainda em aberto. Transferências entre contas não entram.</p>
          </>
        ))}

      {report.kind === "categorias" &&
        (report.rows.length === 0 ? (
          <Empty base={workspaceId} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-5">
            <section className="card lg:col-span-3">
              <h2 className="mb-3 font-bold">Os 12 maiores grupos</h2>
              <RankChart data={report.rows.slice(0, 12).map((r) => ({ name: r.name, total: r.total }))} kind={p.tipo} />
            </section>
            <section className="card space-y-1 lg:col-span-2">
              <h2 className="mb-2 font-bold">Todos os grupos</h2>
              {report.rows.map((r) => (
                <details key={r.name} className="group rounded-xl px-2 py-1.5 open:bg-surface-2">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
                    <span className="w-3 text-muted transition group-open:rotate-90" aria-hidden="true">
                      ›
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                    <span className="tabular-nums">{formatBRL(r.total)}</span>
                    <span className="w-12 text-right text-xs text-muted tabular-nums">{(r.share * 100).toFixed(1).replace(".", ",")}%</span>
                  </summary>
                  <div className="mt-1 ml-5 h-1.5 rounded-full bg-surface-2 group-open:bg-surface">
                    <div
                      className="bar-grow h-1.5 rounded-full"
                      style={{ width: `${Math.max(2, r.share * 100)}%`, background: p.tipo === "income" ? "var(--series-income)" : "var(--series-expense)" }}
                    />
                  </div>
                  {r.children.length > 0 && (
                    <ul className="mt-2 ml-5 space-y-1 text-xs text-muted">
                      {r.children.map((c) => (
                        <li key={c.name} className="flex justify-between gap-2">
                          <span className="truncate">{c.name}</span>
                          <span className="tabular-nums">{formatBRL(c.total)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              ))}
            </section>
          </div>
        ))}

      {report.kind === "comparativo" &&
        (report.rows.length === 0 ? (
          <Empty base={workspaceId} />
        ) : (
          <>
            <HeatTable months={report.months} rows={report.rows} kind={p.tipo} />
            <p className="text-xs text-muted">Quanto mais forte a cor, maior o valor naquele mês (comparado à própria categoria).</p>
          </>
        ))}

      {report.kind === "dre" && (
        <section className="card max-w-3xl p-0">
          <table className="w-full text-sm">
            <tbody>
              {report.rows.map((r) => (
                <tr
                  key={r.label}
                  className={`border-b border-border last:border-0 ${r.kind === "subtotal" ? "bg-surface-2 font-bold" : ""} ${
                    r.kind === "result" ? (r.value < 0 ? "bg-danger-soft" : "bg-primary-soft") : ""
                  }`}
                >
                  <td className={`p-3 ${r.kind === "line" ? "pl-6 text-muted" : ""} ${r.kind === "result" ? "text-base font-extrabold" : ""}`}>{r.label}</td>
                  <td
                    className={`p-3 text-right tabular-nums ${r.value < 0 ? "text-danger" : ""} ${r.kind === "result" ? "text-base font-extrabold" : ""}`}
                  >
                    {formatBRL(r.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-3 text-xs text-muted">
            Baseado nas categorias padrão de empresa (Receita operacional, Impostos, Custos, Despesas…). Valores realizados no período.
          </p>
        </section>
      )}

      {report.kind === "saldo" && (
        <>
          <section className="card">
            <h2 className="mb-3 font-bold">Saldo das contas (sem cartões)</h2>
            <BalanceChart data={report.series} zeroLine />
          </section>
          <Table
            head={["Fim do mês", "Saldo"]}
            rows={report.series
              .filter((_, i, a) => i === a.length - 1 || a[i + 1].date.slice(0, 7) !== a[i].date.slice(0, 7))
              .map((r) => [formatDateBR(r.date), r.balance])}
            signed={[1]}
          />
        </>
      )}
    </div>
  );
}

function monthsCount(de: string, ate: string) {
  return (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5, 7)) - Number(de.slice(5, 7)) + 1;
}

function toneClass(k: Kpi) {
  if (k.tone === "pos") return "text-primary";
  if (k.tone === "neg") return "text-danger";
  if (k.tone === "auto") return k.value < 0 ? "text-danger" : "text-primary";
  return "";
}

function Empty({ base }: { base: string }) {
  return (
    <div className="card">
      <EmptyState
        icon="chart"
        title="Sem lançamentos neste período"
        hint="Escolha outro período acima ou importe um extrato para os relatórios ganharem vida."
        action={{ href: `/w/${base}/importar`, label: "Importar extrato" }}
      />
    </div>
  );
}

/** Tabela com 1ª coluna fixa ao rolar, linhas alternadas e total. `signed`: colunas onde negativo fica vermelho. */
function Table({ head, rows, totals, signed = [] }: { head: string[]; rows: (string | number)[][]; totals?: boolean; signed?: number[] }) {
  const sums = totals ? head.slice(1).map((_, i) => rows.reduce((a, r) => a + (typeof r[i + 1] === "number" ? (r[i + 1] as number) : 0), 0)) : null;
  const red = (j: number, v: number) => signed.includes(j) && v < 0;
  return (
    <section className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr className="border-b border-border">
            {head.map((h, i) => (
              <th key={h} className={`p-3 font-semibold whitespace-nowrap ${i ? "text-right" : "sticky left-0 bg-surface"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border even:bg-surface-2/40 last:border-0 hover:bg-primary-soft/40">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`p-3 whitespace-nowrap ${j ? "text-right tabular-nums" : "sticky left-0 bg-surface font-semibold"} ${
                    typeof c === "number" && red(j, c) ? "text-danger" : ""
                  } ${typeof c === "number" && c === 0 ? "text-muted" : ""}`}
                >
                  {typeof c === "number" ? formatBRL(c) : c}
                </td>
              ))}
            </tr>
          ))}
          {sums && rows.length > 1 && (
            <tr className="border-t-2 border-border bg-surface-2 font-bold">
              <td className="sticky left-0 bg-surface-2 p-3">Total</td>
              {sums.map((s, i) => (
                <td key={i} className={`p-3 text-right whitespace-nowrap tabular-nums ${red(i + 1, s) ? "text-danger" : ""}`}>
                  {formatBRL(s)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

/** Comparativo: cada célula pintada pela intensidade (uma só cor, claro → escuro), relativa à linha. */
function HeatTable({ months, rows, kind }: { months: string[]; rows: { name: string; values: number[]; total: number }[]; kind: "income" | "expense" }) {
  const color = kind === "income" ? "var(--series-income)" : "var(--series-expense)";
  const totals = months.map((_, i) => rows.reduce((a, r) => a + (r.values[i] ?? 0), 0));
  return (
    <section className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            <th className="sticky left-0 bg-surface p-3 text-left font-semibold">Categoria</th>
            {months.map((m) => (
              <th key={m} className="p-3 text-right font-semibold whitespace-nowrap">
                {shortMonth(m)}
              </th>
            ))}
            <th className="p-3 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const max = Math.max(1, ...r.values);
            return (
              <tr key={r.name} className="border-b border-border last:border-0">
                <td className="sticky left-0 bg-surface p-3 font-semibold whitespace-nowrap">{r.name}</td>
                {r.values.map((v, i) => (
                  <td
                    key={i}
                    className={`p-3 text-right whitespace-nowrap tabular-nums ${v === 0 ? "text-muted" : ""}`}
                    title={`${r.name} · ${formatMonthBR(months[i])}: ${formatBRL(v)}`}
                    style={v > 0 ? { background: `color-mix(in srgb, ${color} ${Math.round(8 + (v / max) * 32)}%, transparent)` } : undefined}
                  >
                    {v ? formatBRL(v) : "—"}
                  </td>
                ))}
                <td className="p-3 text-right font-bold whitespace-nowrap tabular-nums">{formatBRL(r.total)}</td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-border bg-surface-2 font-bold">
            <td className="sticky left-0 bg-surface-2 p-3">Total</td>
            {totals.map((t, i) => (
              <td key={i} className="p-3 text-right whitespace-nowrap tabular-nums">
                {formatBRL(t)}
              </td>
            ))}
            <td className="p-3 text-right whitespace-nowrap tabular-nums">{formatBRL(totals.reduce((a, b) => a + b, 0))}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
