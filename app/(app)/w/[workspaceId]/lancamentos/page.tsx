import Link from "next/link";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { buildTxQuery, loadOptions, PAGE_SIZE, type TxFilters, type TxRow } from "@/lib/transactions";
import { formatBRL } from "@/lib/finance/money";
import { formatDateBR, formatMonthBR, shiftMonth, todayISO } from "@/lib/finance/dates";
import { displayStatus, TX_STATUS_LABEL, TX_TYPE_LABEL } from "@/lib/finance/labels";
import { bulkAction } from "./actions";
import { TransactionForm } from "./transaction-form";
import { SelectAll } from "./select-all";

const STATUS_CLASS = {
  paid: "text-primary",
  planned: "text-muted",
  overdue: "text-danger font-medium",
  cancelled: "text-muted line-through",
} as const;

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<TxFilters>;
}) {
  const { workspaceId } = await params;
  const filters = await searchParams;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");
  const options = await loadOptions(supabase, workspaceId);
  const { query, month } = buildTxQuery(supabase, workspaceId, filters, { paginate: true });
  const { data, count } = await query;
  const rows = (data ?? []) as unknown as TxRow[];
  const today = todayISO();
  const page = Math.max(1, Number(filters.pagina) || 1);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const link = (patch: Partial<TxFilters>) => {
    const sp = new URLSearchParams();
    Object.entries({ ...filters, ...patch }).forEach(([k, v]) => v && sp.set(k, v));
    return `/w/${workspaceId}/lancamentos?${sp}`;
  };

  // Totais da página atual, sem contar transferências
  const income = rows.filter((r) => r.type === "income" && r.status !== "cancelled").reduce((s, r) => s + r.amount_cents, 0);
  const expense = rows.filter((r) => r.type === "expense" && r.status !== "cancelled").reduce((s, r) => s + r.amount_cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Lançamentos</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link className="btn-ghost px-3" href={link({ mes: shiftMonth(month, -1), pagina: undefined })} aria-label="Mês anterior">
            ‹
          </Link>
          <span className="min-w-36 text-center capitalize">{formatMonthBR(month)}</span>
          <Link className="btn-ghost px-3" href={link({ mes: shiftMonth(month, 1), pagina: undefined })} aria-label="Próximo mês">
            ›
          </Link>
        </div>
      </div>

      {canEdit && (
        <details className="card" open={rows.length === 0}>
          <summary className="cursor-pointer font-medium">Novo lançamento</summary>
          <div className="mt-4">
            <TransactionForm workspaceId={workspaceId} options={options} defaultDate={today} />
          </div>
        </details>
      )}

      <form className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <input type="hidden" name="mes" value={month} />
        <input name="q" defaultValue={filters.q} placeholder="Buscar descrição" className="input lg:col-span-2" />
        <select name="conta" defaultValue={filters.conta ?? ""} className="input">
          <option value="">Todas as contas</option>
          {options.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select name="categoria" defaultValue={filters.categoria ?? ""} className="input">
          <option value="">Todas as categorias</option>
          <option value="sem">Sem categoria</option>
          {options.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="tipo" defaultValue={filters.tipo ?? ""} className="input">
          <option value="">Todos os tipos</option>
          {Object.entries(TX_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select name="status" defaultValue={filters.status ?? ""} className="input">
            <option value="">Todos</option>
            {Object.entries(TX_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button className="btn-ghost">Filtrar</button>
        </div>
      </form>

      <form action={bulkAction} className="space-y-3">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Selecionados:</span>
            <button name="op" value="pay" className="btn-ghost py-1">
              Marcar pago
            </button>
            <button name="op" value="unpay" className="btn-ghost py-1">
              Marcar previsto
            </button>
            <select name="categoryId" defaultValue="" className="input w-auto py-1" aria-label="Categoria para aplicar">
              <option value="">Remover categoria</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button name="op" value="categorize" className="btn-ghost py-1">
              Categorizar
            </button>
            <button name="op" value="delete" className="btn-ghost py-1 text-danger">
              Excluir
            </button>
            <a href={`/w/${workspaceId}/lancamentos/exportar?${new URLSearchParams(Object.entries({ ...filters, mes: month }).filter(([, v]) => v) as [string, string][])}`} className="ml-auto text-muted hover:underline">
              Exportar CSV
            </a>
          </div>
        )}

        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                {canEdit && (
                  <th className="w-8 p-3">
                    <SelectAll />
                  </th>
                )}
                <th className="p-3 font-normal">Vencimento</th>
                <th className="p-3 font-normal">Descrição</th>
                <th className="p-3 font-normal">Categoria</th>
                <th className="p-3 font-normal">Conta</th>
                <th className="p-3 font-normal">Status</th>
                <th className="p-3 text-right font-normal">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = displayStatus(r.status, r.due_date, today);
                const signed = r.direction * r.amount_cents;
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-background">
                    {canEdit && (
                      <td className="p-3">
                        <input type="checkbox" name="ids" value={r.id} aria-label={`Selecionar ${r.description}`} />
                      </td>
                    )}
                    <td className="p-3 whitespace-nowrap tabular-nums">{formatDateBR(r.due_date)}</td>
                    <td className="p-3">
                      {canEdit && r.type !== "transfer" ? (
                        <Link href={`/w/${workspaceId}/lancamentos/${r.id}`} className="hover:underline">
                          {r.description}
                        </Link>
                      ) : (
                        r.description
                      )}
                      {r.contact && <span className="block text-xs text-muted">{r.contact.name}</span>}
                    </td>
                    <td className="p-3 text-muted">{r.type === "transfer" ? "Transferência" : (r.category?.name ?? "—")}</td>
                    <td className="p-3 text-muted">{r.account?.name}</td>
                    <td className={`p-3 ${STATUS_CLASS[st]}`}>{TX_STATUS_LABEL[st]}</td>
                    <td className={`p-3 text-right whitespace-nowrap tabular-nums ${r.type === "transfer" ? "text-muted" : signed < 0 ? "text-danger" : "text-primary"}`}>
                      {formatBRL(signed)}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted">
                    Nenhum lançamento neste período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">
          Nesta página: receitas <span className="text-primary tabular-nums">{formatBRL(income)}</span> · despesas{" "}
          <span className="text-danger tabular-nums">{formatBRL(expense)}</span> · {count ?? 0} lançamentos
        </p>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link className="btn-ghost py-1" href={link({ pagina: String(page - 1) })}>
                Anterior
              </Link>
            )}
            <span>
              {page} de {pages}
            </span>
            {page < pages && (
              <Link className="btn-ghost py-1" href={link({ pagina: String(page + 1) })}>
                Próxima
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
