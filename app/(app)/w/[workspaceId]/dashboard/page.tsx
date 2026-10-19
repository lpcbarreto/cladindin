import { loadWorkspaceContext } from "@/lib/workspace";
import { formatBRL } from "@/lib/finance/money";

export default async function DashboardPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { current } = await loadWorkspaceContext(workspaceId);

  const cards = [
    { label: "Saldo em contas", value: formatBRL(0) },
    { label: "Receitas do mês", value: formatBRL(0) },
    { label: "Despesas do mês", value: formatBRL(0) },
    { label: "A pagar (7 dias)", value: formatBRL(0) },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{current.name}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-sm text-muted">{c.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted">
        Contas, lançamentos e importações chegam na Fase 2 e 3.
      </p>
    </div>
  );
}
