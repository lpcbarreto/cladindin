import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext as toSafeNext } from "@/lib/safe-next";
import { needsMfa } from "@/lib/mfa";
import { Logo } from "@/components/logo";
import { MfaForm } from "./mfa-form";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = toSafeNext(next);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  if (!(await needsMfa(supabase, data.claims.aal))) redirect(safeNext);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="stagger w-full max-w-sm space-y-6">
        <Logo size={40} />
        <div>
          <h1 className="text-2xl font-extrabold">Verificação em duas etapas</h1>
          <p className="text-sm text-muted">Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
        </div>
        <div className="card space-y-3">
          <MfaForm next={safeNext} />
          <form action="/auth/sair" method="post">
            <button className="w-full text-center text-xs text-muted hover:underline">Entrar com outra conta</button>
          </form>
        </div>
      </div>
    </main>
  );
}
