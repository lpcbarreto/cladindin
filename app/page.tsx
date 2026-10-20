import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { needsMfa } from "@/lib/mfa";

const SHORTCUTS = new Set(["a-pagar", "lancamentos", "projecao", "metas"]);

export default async function Home({ searchParams }: { searchParams: Promise<{ novo?: string; ir?: string }> }) {
  const { novo, ir } = await searchParams;
  // Atalhos do app instalado: abre direto a tela pedida
  const target = (id: string) => `/w/${id}/${ir && SHORTCUTS.has(ir) ? ir : "dashboard"}${novo ? "?novo=1" : ""}`;
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getClaims();
  const user = session?.claims?.sub ? { id: session.claims.sub } : null;
  if (!user) redirect("/login");
  if (await needsMfa(supabase, session?.claims?.aal)) redirect("/login/mfa");

  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (data) redirect(target(data.workspace_id));

  // Usuário sem workspace (ex.: criado antes das migrations): cria o "Pessoal"
  const { data: created, error } = await supabase.rpc("create_workspace", { p_name: "Pessoal", p_kind: "pf" });
  if (error || !created) {
    console.error("create_workspace falhou:", error?.code, error?.message);
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="card max-w-sm space-y-3 text-sm">
          <p>Não foi possível preparar seu espaço de trabalho. Verifique se as migrations foram aplicadas no Supabase.</p>
          <form action="/auth/sair" method="post">
            <button className="btn-ghost">Sair</button>
          </form>
        </div>
      </main>
    );
  }
  redirect(target(created));
}
