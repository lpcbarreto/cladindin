import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { formatDocument } from "@/lib/finance/document";
import { deleteContact } from "./actions";
import { ContactForm } from "./contact-form";

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { workspaceId } = await params;
  const { q } = await searchParams;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");

  let query = supabase
    .from("contacts")
    .select("id, name, document, email, phone, is_customer, is_supplier")
    .eq("workspace_id", workspaceId)
    .order("name")
    .limit(200);
  if (q?.trim()) query = query.ilike("name", `%${q.trim().replace(/[%_]/g, "")}%`);
  const { data: contacts } = await query;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Clientes e fornecedores</h1>
      {canEdit && (
        <section className="card space-y-3">
          <h2 className="font-medium">Novo contato</h2>
          <ContactForm workspaceId={workspaceId} />
        </section>
      )}
      <form className="max-w-sm">
        <input name="q" defaultValue={q} placeholder="Buscar por nome" className="input" />
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-border">
              <th className="p-3 font-normal">Nome</th>
              <th className="p-3 font-normal">CPF/CNPJ</th>
              <th className="p-3 font-normal">Contato</th>
              <th className="p-3 font-normal">Papel</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(contacts ?? []).map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="p-3">{c.name}</td>
                <td className="p-3 tabular-nums text-muted">{formatDocument(c.document)}</td>
                <td className="p-3 text-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</td>
                <td className="p-3 text-muted">
                  {[c.is_customer && "Cliente", c.is_supplier && "Fornecedor"].filter(Boolean).join(", ")}
                </td>
                <td className="p-3 text-right">
                  {canEdit && (
                    <form action={deleteContact}>
                      <input type="hidden" name="workspaceId" value={workspaceId} />
                      <input type="hidden" name="id" value={c.id} />
                      <button className="text-xs text-danger hover:underline">Excluir</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {(contacts ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">
                  Nenhum contato encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
