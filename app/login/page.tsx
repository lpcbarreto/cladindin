import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext as toSafeNext } from "@/lib/safe-next";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";
import { LoginHero } from "./login-hero";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const { next, erro } = await searchParams;
  const safeNext = toSafeNext(next);
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getClaims();
  const user = session?.claims?.sub ? { id: session.claims.sub } : null;
  if (user) redirect(safeNext);

  return (
    <main className="relative grid min-h-dvh lg:grid-cols-2">
      <div className="absolute top-4 right-4 z-20 w-32" style={{ animation: "fade-in 400ms ease 300ms both" }}>
        <ThemeToggle />
      </div>

      <LoginHero />

      <section className="relative flex items-center justify-center px-4 py-10">

        <div className="stagger relative w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <Logo size={40} />
          </div>
          <div>
            <h2 className="text-[26px] font-semibold">Entrar</h2>
            <p className="text-sm text-muted">Bem-vindo de volta.</p>
          </div>
          {erro && <p className="shake rounded-[10px] bg-danger-soft p-3 text-sm text-danger">{erro}</p>}
          <LoginForm next={safeNext} />
          <p className="text-center text-xs text-muted">Seus dados ficam protegidos e separados por workspace.</p>
        </div>
      </section>
    </main>
  );
}
