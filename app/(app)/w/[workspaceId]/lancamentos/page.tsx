import Link from "next/link";
import { Icon } from "@/components/icon";
import { SelectionBar } from "@/components/selection-bar";
import { EmptyState } from "@/components/empty-state";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import {
  buildTxQuery,
  loadOptions,
  PAGE_SIZE,
  type TxFilters,
  type TxRow,
} from "@/lib/transactions";
import { formatBRL } from "@/lib/finance/money";
import {
  formatDateBR,
  formatMonthBR,
  shiftMonth,
  todayISO,
} from "@/lib/finance/dates";
import {
  displayStatus,
  TX_STATUS_LABEL,
  TX_TYPE_LABEL,
} from "@/lib/finance/labels";
import { bulkAction } from "./actions";
import { TransactionForm } from "./transaction-form";
import { SelectAll } from "./select-all";

const STATUS_PILL = {
  paid: "bg-primary-soft text-primary",
  planned: "bg-surface-2 text-muted",
  overdue: "bg-danger-soft text-danger",
  cancelled: "bg-surface-2 text-muted line-through",
} as const;

// Ponto de cor por categoria (decorativo: o nome ao lado é que identifica)
const DOTS = ["#2f6feb", "#e4632f", "#0f9d6e", "#7a5af8", "#b7791f", "#0e7490"];
function dotColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DOTS[h % DOTS.length];
}

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
  const { query, month } = buildTxQuery(supabase, workspaceId, filters, {
    paginate: true,
  });
  // Totais do mês inteiro (todas as páginas), sem transferências nem cancelados
  const [{ data, count }, { data: monthRows }] = await Promise.all([
    query,
    supabase
      .from("transactions")
      .select("type, direction, amount_cents")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .in("type", ["income", "expense"])
      .neq("status", "cancelled")
      .gte("due_date", `${month}-01`)
      .lte("due_date", `${month}-31`)
      .limit(20000),
  ]);
  const monthIncome = (monthRows ?? [])
    .filter((r) => r.type === "income")
    .reduce((s, r) => s + r.amount_cents, 0);
  const monthExpense = (monthRows ?? [])
    .filter((r) => r.type === "expense")
    .reduce((s, r) => s - r.direction * r.amount_cents, 0);
  const rows = (data ?? []) as unknown as TxRow[];
  const today = todayISO();
  const page = Math.max(1, Number(filters.pagina) || 1);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const link = (patch: Partial<TxFilters>) => {
    const sp = new URLSearchParams();
    Object.entries({ ...filters, ...patch }).forEach(
      ([k, v]) => v && sp.set(k, v),
    );
    return `/w/${workspaceId}/lancamentos?${sp}`;
  };

  // Totais da página atual, sem contar transferências
  const income = rows
    .filter((r) => r.type === "income" && r.status !== "cancelled")
    .reduce((s, r) => s + r.amount_cents, 0);
  const expense = rows
    .filter((r) => r.type === "expense" && r.status !== "cancelled")
    .reduce((s, r) => s - r.direction * r.amount_cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{current.name}</p>
          <h1 className="text-[28px] font-extrabold tracking-tight">
            Lançamentos
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-[10px] bg-surface-2 p-[3px] text-sm font-medium">
            <Link
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-foreground"
              href={link({ mes: shiftMonth(month, -1), pagina: undefined })}
              aria-label="Mês anterior"
            >
              ‹
            </Link>
            <span className="min-w-32 px-2 text-center capitalize">
              {formatMonthBR(month)}
            </span>
            <Link
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-foreground"
              href={link({ mes: shiftMonth(month, 1), pagina: undefined })}
              aria-label="Próximo mês"
            >
              ›
            </Link>
          </div>
          <a
            href={`/w/${workspaceId}/lancamentos/exportar?${new URLSearchParams(Object.entries({ ...filters, mes: month }).filter(([, v]) => v) as [string, string][])}`}
            className="btn-ghost h-10"
          >
            Exportar
          </a>
        </div>
      </div>

      <div className="stagger grid gap-3.5 sm:grid-cols-3">
        <div className="card px-[18px] py-3.5">
          <p className="text-xs text-muted">Entradas no mês</p>
          <p className="text-[22px] font-semibold text-primary tabular-nums">
            {formatBRL(monthIncome)}
          </p>
        </div>
        <div className="card px-[18px] py-3.5">
          <p className="text-xs text-muted">Saídas no mês</p>
          <p className="text-[22px] font-semibold tabular-nums">
            {formatBRL(monthExpense)}
          </p>
        </div>
        <div className="card px-[18px] py-3.5">
          <p className="text-xs text-muted">Resultado</p>
          <p
            className={`text-[22px] font-semibold tabular-nums ${monthIncome - monthExpense < 0 ? "text-danger" : "text-primary"}`}
          >
            {formatBRL(monthIncome - monthExpense)}
          </p>
        </div>
      </div>

      {canEdit && (
        <details className="card" open={rows.length === 0}>
          <summary className="cursor-pointer font-medium">
            Novo lançamento
          </summary>
          <div className="mt-4">
            <TransactionForm
              workspaceId={workspaceId}
              options={options}
              defaultDate={today}
            />
          </div>
        </details>
      )}

      <nav aria-label="Filtros rápidos" className="flex flex-wrap gap-2">
        {[
          {
            label: "Todos",
            patch: { tipo: undefined, status: undefined, categoria: undefined },
            on: !filters.tipo && !filters.status && !filters.categoria,
          },
          {
            label: "Receitas",
            patch: { tipo: "income", status: undefined, categoria: undefined },
            on: filters.tipo === "income",
          },
          {
            label: "Despesas",
            patch: { tipo: "expense", status: undefined, categoria: undefined },
            on: filters.tipo === "expense",
          },
          {
            label: "Atrasados",
            patch: { status: "overdue", tipo: undefined, categoria: undefined },
            on: filters.status === "overdue",
          },
          {
            label: "Previstos",
            patch: { status: "planned", tipo: undefined, categoria: undefined },
            on: filters.status === "planned",
          },
          {
            label: "Sem categoria",
            patch: { categoria: "sem", tipo: undefined, status: undefined },
            on: filters.categoria === "sem",
          },
        ].map((c) => (
          <Link
            key={c.label}
            href={link({ ...c.patch, pagina: undefined })}
            aria-current={c.on ? "true" : undefined}
            className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors ${
              c.on
                ? "border-brand bg-primary-soft font-semibold text-primary"
                : "border-border bg-surface font-medium text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {c.label}
          </Link>
        ))}
      </nav>

      <details
        className="group"
        open={
          !!(
            filters.q ||
            filters.conta ||
            (filters.categoria && filters.categoria !== "sem")
          )
        }
      >
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
          Mais filtros
          <span aria-hidden="true" className="transition group-open:rotate-180">
            ▾
          </span>
        </summary>
        <form className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <input type="hidden" name="mes" value={month} />
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Buscar descrição"
            className="input lg:col-span-2"
          />
          <select
            name="conta"
            defaultValue={filters.conta ?? ""}
            className="input"
          >
            <option value="">Todas as contas</option>
            {options.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            name="categoria"
            defaultValue={filters.categoria ?? ""}
            className="input"
          >
            <option value="">Todas as categorias</option>
            <option value="sem">Sem categoria</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            name="tipo"
            defaultValue={filters.tipo ?? ""}
            className="input"
          >
            <option value="">Todos os tipos</option>
            {Object.entries(TX_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              name="status"
              defaultValue={filters.status ?? ""}
              className="input"
            >
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
      </details>

      <form id="lancamentos-massa" action={bulkAction} className="space-y-3">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-surface px-3 py-2 text-sm">
            <SelectionBar formId="lancamentos-massa" />
            <span className="text-muted">Com os selecionados:</span>
            <button name="op" value="pay" className="btn-ghost py-1">
              Marcar pago
            </button>
            <button name="op" value="unpay" className="btn-ghost py-1">
              Marcar previsto
            </button>
            <select
              name="categoryId"
              defaultValue=""
              className="input w-auto py-1"
              aria-label="Categoria para aplicar"
            >
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
            <button
              name="op"
              value="delete"
              className="btn-ghost py-1 text-danger"
            >
              Excluir
            </button>
          </div>
        )}

        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/50 text-left text-xs text-muted">
              <tr className="border-b border-border">
                {canEdit && (
                  <th className="w-8 p-3">
                    <SelectAll />
                  </th>
                )}
                <th className="p-3 font-semibold">Vencimento</th>
                <th className="p-3 font-semibold">Descrição</th>
                <th className="p-3 font-semibold">Categoria</th>
                <th className="p-3 font-semibold">Conta</th>
                <th className="p-3 font-semibold">Situação</th>
                <th className="p-3 text-right font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = displayStatus(r.status, r.due_date, today);
                const signed = r.direction * r.amount_cents;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 hover:bg-surface-2/40"
                  >
                    {canEdit && (
                      <td className="p-3">
                        <input
                          type="checkbox"
                          name="ids"
                          value={r.id}
                          aria-label={`Selecionar ${r.description}`}
                        />
                      </td>
                    )}
                    <td className="p-3 whitespace-nowrap text-muted tabular-nums">
                      {formatDateBR(r.due_date)}
                    </td>
                    <td className="p-3">
                      {canEdit && r.type !== "transfer" ? (
                        <Link
                          href={`/w/${workspaceId}/lancamentos/${r.id}`}
                          className="font-medium hover:underline"
                        >
                          {r.description}
                        </Link>
                      ) : (
                        r.description
                      )}
                      {(r.attachments?.[0]?.count ?? 0) > 0 && (
                        <span
                          className="ml-1 inline-flex align-middle text-muted"
                          title="Tem comprovante"
                        >
                          <Icon
                            name="paperclip"
                            size={14}
                            label="Tem comprovante"
                          />
                        </span>
                      )}
                      {r.contact && (
                        <span className="block text-xs text-muted">
                          {r.contact.name}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {r.type === "transfer" ? (
                        <span className="text-muted">Transferência</span>
                      ) : r.category ? (
                        <span className="inline-flex items-center gap-1.5 text-[13px]">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: dotColor(r.category.name) }}
                          />
                          {r.category.name}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="p-3 text-muted">{r.account?.name}</td>
                    <td className="p-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUS_PILL[st]}`}
                      >
                        {TX_STATUS_LABEL[st]}
                      </span>
                    </td>
                    <td
                      className={`p-3 text-right font-semibold whitespace-nowrap tabular-nums ${r.type === "transfer" ? "text-muted" : signed < 0 ? "" : "text-primary"}`}
                    >
                      {formatBRL(signed)}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-2">
                    <EmptyState
                      icon="receipt"
                      title="Nenhum lançamento neste período"
                      hint={
                        <>
                          Aperte{" "}
                          <kbd className="rounded bg-surface-2 px-1">N</kbd>{" "}
                          para um lançamento rápido ou importe o extrato do
                          banco.
                        </>
                      }
                      action={{
                        href: `/w/${workspaceId}/importar`,
                        label: "Importar extrato",
                      }}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">
          Nesta página: receitas{" "}
          <span className="text-primary tabular-nums">{formatBRL(income)}</span>{" "}
          · despesas{" "}
          <span className="text-danger tabular-nums">{formatBRL(expense)}</span>{" "}
          · {count ?? 0} lançamentos
        </p>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                className="btn-ghost py-1"
                href={link({ pagina: String(page - 1) })}
              >
                Anterior
              </Link>
            )}
            <span>
              {page} de {pages}
            </span>
            {page < pages && (
              <Link
                className="btn-ghost py-1"
                href={link({ pagina: String(page + 1) })}
              >
                Próxima
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
