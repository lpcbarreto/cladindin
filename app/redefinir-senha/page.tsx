import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  // Só chega aqui com a sessão aberta pelo link do e-mail
  if (!data?.claims?.sub) redirect("/login?erro=Link%20inv%C3%A1lido%20ou%20expirado");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="stagger w-full max-w-sm space-y-6">
        <Logo size={40} />
        <div>
          <h1 className="text-2xl font-extrabold">Criar nova senha</h1>
          <p className="text-sm text-muted">Escolha uma senha com ao menos 8 caracteres.</p>
        </div>
        <div className="card">
          <ResetForm />
        </div>
      </div>
    </main>
  );
}
