import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (data) redirect(`/w/${data.workspace_id}/dashboard`);

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
  redirect(`/w/${created}/dashboard`);
}
