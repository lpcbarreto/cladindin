import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Tabelas do workspace incluídas na exportação (LGPD: portabilidade dos dados)
const TABLES = [
  "workspaces",
  "workspace_members",
  "accounts",
  "credit_cards",
  "invoices",
  "categories",
  "cost_centers",
  "tags",
  "contacts",
  "transactions",
  "transaction_tags",
  "recurrence_rules",
  "categorization_rules",
  "budgets",
  "import_batches",
  "import_templates",
  "attachments",
  "savings_goals",
  "goal_contributions",
] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let page = 0; page < 200; page++) {
      const q = supabase.from(t).select("*").range(page * 1000, page * 1000 + 999);
      const { data, error } = await (t === "workspaces" ? q.eq("id", workspaceId) : q.eq("workspace_id", workspaceId));
      if (error) return NextResponse.json({ error: `Falha ao exportar ${t}` }, { status: 403 });
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    out[t] = rows;
  }
  if (!out.workspaces.length) return NextResponse.json({ error: "Workspace não encontrado" }, { status: 404 });

  const body = JSON.stringify({ exported_at: new Date().toISOString(), format: "cladindin-export-v1", money: "centavos", data: out }, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cladindin-${workspaceId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
