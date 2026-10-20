import Link from "next/link";
import { loadWorkspaceContext } from "@/lib/workspace";
import { loadTaxReport } from "@/lib/tax-report";
import { formatBRL } from "@/lib/finance/money";
import { formatDocument } from "@/lib/finance/document";
import { todayISO } from "@/lib/finance/dates";
import { PrintButton } from "@/components/charts";

export default async function TaxPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ ano?: string }>;
}) {
  const { workspaceId } = await params;
  const { ano } = await searchParams;
  const thisYear = Number(todayISO().slice(0, 4));
  // Padrão: ano-calendário da próxima declaração (o ano passado)
  const year = Math.min(thisYear, Math.max(2000, Number(ano) || thisYear - 1));
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const r = await loadTaxReport(supabase, workspaceId, year);
  const base = `/w/${workspaceId}/relatorios/imposto`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/w/${workspaceId}/relatorios`} className="text-sm text-muted hover:underline">
            ← Relatórios
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight">Imposto de Renda {year}</h1>
          <p className="text-sm text-muted">
            {current.name} · lançamentos pagos de 01/01 a 31/12/{year}. Serve de apoio: confira com seus informes antes de declarar.
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          {[thisYear - 2, thisYear - 1, thisYear].map((y) => (
            <Link key={y} href={`${base}?ano=${y}`} className={`rounded-full px-3 py-1 text-sm font-semibold ${y === year ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted"}`}>
              {y}
            </Link>
          ))}
          <a href={`${base}/exportar?ano=${year}`} className="btn-ghost">
            Exportar CSV
          </a>
          <PrintButton />
        </div>
      </div>

      <div className="stagger grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm font-semibold text-muted">Rendimentos recebidos</p>
          <p className="text-2xl font-extrabold text-primary tabular-nums">{formatBRL(r.income)}</p>
        </div>
        <div className="card">
          <p className="text-sm font-semibold text-muted">Despesas totais</p>
          <p className="text-2xl font-extrabold tabular-nums">{formatBRL(r.expense)}</p>
        </div>
        <div className="card">
          <p className="text-sm font-semibold text-muted">Possivelmente dedutíveis</p>
          <p className="text-2xl font-extrabold tabular-nums">{formatBRL(r.deductibleTotal)}</p>
          <p className="text-xs text-muted">saúde, educação, previdência, pensão</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-2">
          <h2 className="font-bold">Rendimentos por categoria</h2>
          {r.incomeByCategory.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma receita paga no ano.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {r.incomeByCategory.map((i) => (
                <li key={i.name} className="flex justify-between py-2">
                  <span>{i.name}</span>
                  <b className="tabular-nums">{formatBRL(i.total)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card space-y-2">
          <h2 className="font-bold">Despesas possivelmente dedutíveis</h2>
          {r.deductible.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma despesa em categorias de saúde, educação ou previdência.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {r.deductible.map((d) => (
                <li key={d.name} className="flex justify-between py-2">
                  <span>{d.name}</span>
                  <b className="tabular-nums">{formatBRL(d.total)}</b>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">Educação tem limite anual por pessoa; farmácia em geral não é dedutível. Confira as regras da Receita.</p>
        </section>
      </div>

      <section className="card space-y-2 overflow-x-auto">
        <h2 className="font-bold">Pagamentos e recebimentos por CPF/CNPJ</h2>
        <p className="text-sm text-muted">Só aparecem contatos com documento cadastrado — útil para médicos, dentistas, escolas e locatários.</p>
        {r.contacts.length === 0 ? (
          <p className="text-sm text-muted">Nenhum contato com CPF/CNPJ nos lançamentos do ano.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="py-2 font-normal">Nome</th>
                <th className="py-2 font-normal">CPF/CNPJ</th>
                <th className="py-2 text-right font-normal">Recebido</th>
                <th className="py-2 text-right font-normal">Pago</th>
              </tr>
            </thead>
            <tbody>
              {r.contacts.map((c) => (
                <tr key={c.document! + c.name} className="border-b border-border last:border-0">
                  <td className="py-2">{c.name}</td>
                  <td className="py-2 tabular-nums">{formatDocument(c.document)}</td>
                  <td className="py-2 text-right tabular-nums">{c.income ? formatBRL(c.income) : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{c.expense ? formatBRL(c.expense) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
