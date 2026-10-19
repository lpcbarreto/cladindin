import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { archiveCategory, renameCategory } from "./actions";
import { CategoryForm } from "./category-form";

type Cat = { id: string; name: string; kind: "income" | "expense"; parent_id: string | null; archived: boolean };

export default async function CategoriesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  const canEdit = hasRole(current.role, "editor");

  const { data } = await supabase
    .from("categories")
    .select("id, name, kind, parent_id, archived")
    .eq("workspace_id", workspaceId)
    .order("name");
  const all = (data ?? []) as Cat[];
  const parents = all.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => all.filter((c) => c.parent_id === id);

  const section = (kind: Cat["kind"], title: string) => (
    <section className="card space-y-3">
      <h2 className="font-medium">{title}</h2>
      <ul className="space-y-3 text-sm">
        {parents
          .filter((p) => p.kind === kind)
          .map((p) => (
            <li key={p.id} className={p.archived ? "opacity-50" : ""}>
              <Row cat={p} workspaceId={workspaceId} canEdit={canEdit} bold />
              <ul className="mt-1 ml-4 space-y-1 border-l border-border pl-3">
                {childrenOf(p.id).map((c) => (
                  <li key={c.id} className={c.archived ? "opacity-50" : ""}>
                    <Row cat={c} workspaceId={workspaceId} canEdit={canEdit} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ul>
    </section>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Categorias</h1>
      {canEdit && (
        <section className="card space-y-3">
          <h2 className="font-medium">Nova categoria</h2>
          <CategoryForm workspaceId={workspaceId} parents={parents.filter((p) => !p.archived)} />
        </section>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {section("expense", "Despesas")}
        {section("income", "Receitas")}
      </div>
    </div>
  );
}

function Row({ cat, workspaceId, canEdit, bold }: { cat: Cat; workspaceId: string; canEdit: boolean; bold?: boolean }) {
  if (!canEdit) return <span className={bold ? "font-medium" : ""}>{cat.name}</span>;
  return (
    <div className="flex items-center gap-2">
      <form action={renameCategory} className="flex-1">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="id" value={cat.id} />
        <input
          name="name"
          defaultValue={cat.name}
          aria-label="Nome da categoria"
          className={`w-full rounded bg-transparent px-1 hover:bg-background focus:bg-background ${bold ? "font-medium" : ""}`}
        />
      </form>
      <form action={archiveCategory}>
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="id" value={cat.id} />
        <input type="hidden" name="archived" value={String(!cat.archived)} />
        <button className="text-xs text-muted hover:underline">{cat.archived ? "Reativar" : "Arquivar"}</button>
      </form>
    </div>
  );
}
