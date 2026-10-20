import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { loadOptions } from "@/lib/transactions";
import { todayISO } from "@/lib/finance/dates";
import { TransactionForm } from "../transaction-form";
import { formatBRL } from "@/lib/finance/money";
import { listAttachments } from "@/lib/attachments";
import { removeAttachment } from "../../a-pagar/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { AttachmentForm } from "./attachment-form";
import { CategorizationRuleForm } from "../../regras/rule-form";
import { suggestPattern } from "@/lib/finance/rules";

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
  const [options, attachments] = await Promise.all([loadOptions(supabase, workspaceId), listAttachments(supabase, tx.id)]);

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
            refund: tx.type === "expense" && tx.direction === 1,
          }}
        />
      </div>
      {tx.recurrence_id && (
        <p className="rounded-2xl bg-primary-soft p-3 text-sm">
          Esta é uma ocorrência de recorrência: ao salvar, só ela muda.{" "}
          <Link href={`/w/${workspaceId}/recorrencias/${tx.recurrence_id}`} className="font-semibold text-primary underline">
            Editar a regra
          </Link>{" "}
          para mudar esta e as próximas.
        </p>
      )}
      {(tx.interest_cents > 0 || tx.fine_cents > 0 || tx.discount_cents > 0) && (
        <p className="text-sm text-muted">
          Valor original {formatBRL(tx.original_amount_cents ?? tx.amount_cents)} · juros {formatBRL(tx.interest_cents)} · multa{" "}
          {formatBRL(tx.fine_cents)} · desconto {formatBRL(tx.discount_cents)}
        </p>
      )}
      <details className="card">
        <summary className="cursor-pointer font-bold">Criar regra para parecidos</summary>
        <p className="mt-2 text-sm text-muted">Lançamentos futuros com descrição parecida recebem a mesma categoria e o mesmo contato automaticamente.</p>
        <div className="mt-3">
          <CategorizationRuleForm
            compact
            workspaceId={workspaceId}
            options={options}
            defaults={{
              pattern: suggestPattern(tx.statement_description || tx.description),
              categoryId: tx.category_id ?? undefined,
              contactId: tx.contact_id ?? undefined,
              direction: tx.direction > 0 && tx.type === "income" ? "in" : "out",
            }}
          />
        </div>
      </details>
      <section className="card space-y-3">
        <h2 className="font-bold">Comprovantes</h2>
        {attachments.length > 0 ? (
          <ul className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {attachments.map((a) => (
              <li key={a.id} className="space-y-2 rounded-2xl border border-border p-2">
                {a.url && a.mime_type?.startsWith("image/") && a.mime_type !== "image/heic" ? (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={`Comprovante ${a.file_name}`} className="h-40 w-full object-cover transition hover:scale-105" loading="lazy" />
                  </a>
                ) : a.url && a.mime_type === "application/pdf" ? (
                  <object data={`${a.url}#toolbar=0&view=FitH`} type="application/pdf" className="pointer-events-none h-40 w-full rounded-xl bg-surface-2" aria-label={`Prévia de ${a.file_name}`}>
                    <div className="grid h-40 place-items-center rounded-xl bg-surface-2 text-3xl">📄</div>
                  </object>
                ) : (
                  <div className="grid h-40 place-items-center rounded-xl bg-surface-2 text-3xl" aria-hidden="true">
                    📎
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="truncate text-primary underline">
                    {a.file_name}
                  </a>
                ) : (
                  <span className="truncate">{a.file_name}</span>
                )}
                <form action={removeAttachment}>
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="id" value={tx.id} />
                  <input type="hidden" name="attachmentId" value={a.id} />
                  <ConfirmButton message="Remover este comprovante?" className="text-xs text-danger hover:underline">
                    Remover
                  </ConfirmButton>
                </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nenhum comprovante.</p>
        )}
        <AttachmentForm workspaceId={workspaceId} id={tx.id} />
      </section>
    </div>
  );
}
