import Link from "next/link";
import { loadWorkspaceContext } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { formatDateBR, formatMonthBR } from "@/lib/finance/dates";
import { buildReport, parseReportParams, REPORTS, type ReportKey } from "@/lib/report-data";
import { BalanceChart, FlowChart, PrintButton, RankChart } from "@/components/charts";

const shortMonth = (m: string) => `${m.slice(5, 7)}/${m.slice(2, 4)}`;

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">{current.name}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Relatórios</h1>
        </div>
        <div className="no-print flex gap-2">
          <a href={`${base}/imposto`} className="btn-ghost">
            Imposto de Renda
          </a>
          <a href={`${base}/exportar?${qs({})}`} className="btn-ghost">
            Exportar CSV
          </a>
          <PrintButton />
        </div>
      </div>

      <nav className="no-print flex flex-wrap gap-1 rounded-2xl bg-surface-2 p-1 text-sm font-semibold" aria-label="Tipo de relatório">
        {(Object.keys(REPORTS) as ReportKey[]).map((k) => (
          <Link
            key={k}
            href={`${base}?${qs({ r: k })}`}
            aria-current={p.r === k ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 ${p.r === k ? "bg-surface shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            {REPORTS[k]}
          </Link>
        ))}
      </nav>

      {/* Filtros: uma linha, acima dos gráficos */}
      <form className="no-print flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="r" value={p.r} />
        <label>
          De
          <input type="month" name="de" defaultValue={p.de} className="input mt-1 w-40" />
        </label>
        <label>
          Até
          <input type="month" name="ate" defaultValue={p.ate} className="input mt-1 w-40" />
        </label>
        {p.r !== "saldo" && (
          <label>
            Regime
            <select name="base" defaultValue={p.base} className="input mt-1">
              <option value="competencia">Competência (data da compra)</option>
              <option value="caixa">Caixa (data do pagamento)</option>
            </select>
          </label>
        )}
        {(p.r === "categorias" || p.r === "comparativo") && (
          <label>
            Natureza
            <select name="tipo" defaultValue={p.tipo} className="input mt-1">
              <option value="expense">Despesas</option>
              <option value="income">Receitas</option>
            </select>
          </label>
        )}
        {p.r === "categorias" && (
          <label>
            Agrupar por
            <select name="dim" defaultValue={p.dim} className="input mt-1">
              <option value="categoria">Categoria</option>
              <option value="contato">Cliente/fornecedor</option>
              <option value="centro">Centro de custo</option>
            </select>
          </label>
        )}
        <label>
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

      <p className="text-sm text-muted">
        {REPORTS[p.r]} · {formatMonthBR(p.de)} a {formatMonthBR(p.ate)}
        {p.r !== "saldo" && ` · regime de ${p.base === "competencia" ? "competência" : "caixa"}`}
      </p>

      {report.kind === "fluxo" && (
        <>
          <section className="card">
            <h2 className="mb-3 font-bold">Receitas × despesas realizadas</h2>
            <FlowChart data={report.rows} />
          </section>
          <Table
            head={["Mês", "Receitas", "Despesas", "Resultado", "Receitas previstas", "Despesas previstas", "Resultado previsto"]}
            rows={report.rows.map((r) => [formatMonthBR(r.month), r.income, r.expense, r.net, r.incomePlanned, r.expensePlanned, r.netPlanned])}
            totals
          />
          <p className="text-xs text-muted">Previsto = realizado + lançamentos ainda em aberto. Transferências entre contas não entram.</p>
        </>
      )}

      {report.kind === "categorias" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card">
            <h2 className="mb-3 font-bold">{p.tipo === "income" ? "Receitas" : "Despesas"} realizadas</h2>
            {report.rows.length ? (
              <RankChart data={report.rows.slice(0, 12).map((r) => ({ name: r.name, total: r.total }))} kind={p.tipo} />
            ) : (
              <p className="text-sm text-muted">Sem lançamentos no período.</p>
            )}
          </section>
          <section className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-border">
                  <th className="p-3 font-normal">Grupo</th>
                  <th className="p-3 text-right font-normal">Total</th>
                  <th className="p-3 text-right font-normal">%</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <FragmentRows key={r.name} row={r} />
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {report.kind === "comparativo" && (
        <Table
          head={["Categoria", ...report.months.map(shortMonth), "Total"]}
          rows={report.rows.map((r) => [r.name, ...r.values, r.total])}
          totals
        />
      )}

      {report.kind === "dre" && (
        <section className="card max-w-2xl p-0">
          <table className="w-full text-sm">
            <tbody>
              {report.rows.map((r) => (
                <tr
                  key={r.label}
                  className={`border-b border-border last:border-0 ${r.kind === "subtotal" ? "bg-surface-2 font-bold" : ""} ${r.kind === "result" ? "text-base font-extrabold" : ""}`}
                >
                  <td className="p-3">{r.label}</td>
                  <td className={`p-3 text-right tabular-nums ${r.value < 0 ? "text-danger" : ""}`}>{formatBRL(r.value)}</td>
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
            <BalanceChart data={report.series} />
          </section>
          <Table
            head={["Data", "Saldo"]}
            rows={report.series.filter((_, i, a) => i === a.length - 1 || a[i + 1].date.slice(0, 7) !== a[i].date.slice(0, 7)).map((r) => [formatDateBR(r.date), r.balance])}
            caption="Saldo no fim de cada mês"
          />
        </>
      )}
    </div>
  );
}

function FragmentRows({ row }: { row: { name: string; total: number; share: number; children: { name: string; total: number }[] } }) {
  return (
    <>
      <tr className="border-b border-border">
        <td className="p-3 font-semibold">{row.name}</td>
        <td className="p-3 text-right font-semibold tabular-nums">{formatBRL(row.total)}</td>
        <td className="p-3 text-right text-muted tabular-nums">{(row.share * 100).toFixed(1).replace(".", ",")}%</td>
      </tr>
      {row.children.map((c) => (
        <tr key={c.name} className="border-b border-border text-muted">
          <td className="p-2 pl-8">{c.name}</td>
          <td className="p-2 text-right tabular-nums">{formatBRL(c.total)}</td>
          <td />
        </tr>
      ))}
    </>
  );
}

function Table({ head, rows, totals, caption }: { head: string[]; rows: (string | number)[][]; totals?: boolean; caption?: string }) {
  const sums = totals ? head.slice(1).map((_, i) => rows.reduce((a, r) => a + (typeof r[i + 1] === "number" ? (r[i + 1] as number) : 0), 0)) : null;
  return (
    <section className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        {caption && <caption className="p-3 text-left text-xs text-muted">{caption}</caption>}
        <thead className="text-left text-muted">
          <tr className="border-b border-border">
            {head.map((h, i) => (
              <th key={h} className={`p-3 font-normal whitespace-nowrap ${i ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {r.map((c, j) => (
                <td key={j} className={`p-3 whitespace-nowrap ${j ? "text-right tabular-nums" : ""} ${typeof c === "number" && c < 0 ? "text-danger" : ""}`}>
                  {typeof c === "number" ? formatBRL(c) : c}
                </td>
              ))}
            </tr>
          ))}
          {sums && rows.length > 1 && (
            <tr className="bg-surface-2 font-bold">
              <td className="p-3">Total</td>
              {sums.map((s, i) => (
                <td key={i} className={`p-3 text-right whitespace-nowrap tabular-nums ${s < 0 ? "text-danger" : ""}`}>
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
