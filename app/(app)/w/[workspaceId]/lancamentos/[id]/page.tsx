import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { loadOptions } from "@/lib/transactions";
import { todayISO } from "@/lib/finance/dates";
import { TransactionForm } from "../transaction-form";

export default async function EditTransactionPage({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const { workspaceId, id } = await params;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  if (!hasRole(current.role, "editor")) notFound();

  const { data: tx } = await supabase
    .from("transactions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!tx || tx.type === "transfer") notFound();
  const options = await loadOptions(supabase, workspaceId);

  return (
    <div className="space-y-6">
      <Link href={`/w/${workspaceId}/lancamentos?mes=${tx.due_date.slice(0, 7)}`} className="text-sm text-muted hover:underline">
        ← Voltar
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight">Editar lançamento</h1>
      <div className="card">
        <TransactionForm
          workspaceId={workspaceId}
          options={options}
          defaultDate={todayISO()}
          initial={{
            id: tx.id,
            type: tx.type,
            description: tx.description,
            amount: (tx.amount_cents / 100).toFixed(2).replace(".", ","),
            dueDate: tx.due_date,
            competenceDate: tx.competence_date,
            paidDate: tx.paid_date ?? "",
            status: tx.status,
            accountId: tx.account_id,
            categoryId: tx.category_id ?? "",
            contactId: tx.contact_id ?? "",
            notes: tx.notes ?? "",
          }}
        />
      </div>
    </div>
  );
}
