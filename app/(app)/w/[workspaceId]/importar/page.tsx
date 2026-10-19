import Link from "next/link";
import { notFound } from "next/navigation";
import { loadWorkspaceContext, hasRole } from "@/lib/workspace";
import { loadOptions } from "@/lib/transactions";
import { ImportWizard } from "./wizard";

export default async function ImportPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { supabase, current } = await loadWorkspaceContext(workspaceId);
  if (!hasRole(current.role, "editor")) notFound();
  const options = await loadOptions(supabase, workspaceId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Importar extrato</h1>
        <Link href={`/w/${workspaceId}/importacoes`} className="text-sm text-muted hover:underline">
          Histórico de importações
        </Link>
      </div>
      <ImportWizard workspaceId={workspaceId} accounts={options.accounts} categories={options.categories} />
    </div>
  );
}
