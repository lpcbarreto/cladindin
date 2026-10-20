import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";
import { formatDateBR } from "@/lib/finance/dates";
import { undoImport } from "../importar/actions";
import { ConfirmButton } from "@/components/confirm-button";

export default async function ImportHistoryPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");

  const { data: batches } = await supabase
    .from("import_batches")
    .select(
      "id, file_name, parser, total_rows, new_rows, duplicate_rows, reconciled_rows, statement_balance_cents, statement_balance_date, created_at, undone_at, account:accounts(name)",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Importações</h1>
        {canEdit && (
          <Link href={`/w/${workspaceId}/importar`} className="btn">
            Importar extrato
          </Link>
        )}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-border">
              <th className="p-3 font-normal">Data</th>
              <th className="p-3 font-normal">Arquivo</th>
              <th className="p-3 font-normal">Conta</th>
              <th className="p-3 font-normal">Resultado</th>
              <th className="p-3 font-normal">Saldo do banco</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(batches ?? []).map((b) => {
              const account = b.account as unknown as { name: string } | null;
              return (
                <tr key={b.id} className={`border-b border-border last:border-0 ${b.undone_at ? "opacity-50" : ""}`}>
                  <td className="p-3 whitespace-nowrap">{new Date(b.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                  <td className="p-3">
                    {b.file_name}
                    <span className="block text-xs text-muted uppercase">{b.parser}</span>
                  </td>
                  <td className="p-3">{account?.name}</td>
                  <td className="p-3 text-muted">
                    {b.new_rows} nova(s), {b.reconciled_rows} conciliada(s), {b.duplicate_rows} duplicada(s) de {b.total_rows}
                  </td>
                  <td className="p-3 whitespace-nowrap tabular-nums text-muted">
                    {b.statement_balance_cents !== null && `${formatBRL(b.statement_balance_cents)} em ${formatDateBR(b.statement_balance_date)}`}
                  </td>
                  <td className="p-3 text-right">
                    {b.undone_at ? (
                      <span className="text-xs text-muted">Desfeita</span>
                    ) : (
                      canEdit && (
                        <form action={undoImport}>
                          <input type="hidden" name="workspaceId" value={workspaceId} />
                          <input type="hidden" name="batchId" value={b.id} />
                          <ConfirmButton
                            message="Desfazer esta importação? Os lançamentos criados serão removidos e os conciliados voltam a ficar previstos."
                            className="text-xs text-danger hover:underline"
                          >
                            Desfazer
                          </ConfirmButton>
                        </form>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
            {(batches ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-2">
                  <EmptyState
                    icon="📥"
                    title="Nenhuma importação ainda"
                    hint="Baixe o extrato no app do seu banco (OFX, CSV ou PDF) e traga tudo de uma vez, sem duplicar."
                    action={{ href: `/w/${workspaceId}/importar`, label: "Importar agora" }}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
