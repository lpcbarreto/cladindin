import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(safeNext);

  return (
    <main className="relative grid min-h-dvh lg:grid-cols-2">
      <div className="absolute top-4 right-4 z-20 w-32" style={{ animation: "fade-in 600ms ease 1s both" }}>
        <ThemeToggle />
      </div>

      <LoginHero />

      <section className="relative flex items-center justify-center overflow-hidden px-4 py-10">
        {/* Brilhos suaves atrás do formulário */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="blob absolute top-[12%] -right-24 h-72 w-72 bg-primary/10 blur-2xl" />
          <div className="blob absolute bottom-[8%] -left-20 h-64 w-64 bg-accent/15 blur-2xl" style={{ animationDelay: "-5s" }} />
        </div>

        <div className="stagger relative w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <Logo size={40} />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold">
              Que bom te ver!{" "}
              <span aria-hidden="true" className="inline-block origin-[70%_70%]" style={{ animation: "wave-hand 1.8s ease-in-out 0.8s 2" }}>
                👋
              </span>
            </h2>
            <p className="text-sm text-muted">Entre para acessar suas finanças.</p>
          </div>
          {erro && <p className="shake rounded-xl bg-danger-soft p-3 text-sm text-danger">{erro}</p>}
          <div className="card transition-shadow duration-500 focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_14%,transparent),0_20px_40px_-20px_rgba(31,42,36,0.35)]">
            <LoginForm next={safeNext} />
          </div>
          <p className="text-center text-xs text-muted">Seus dados ficam protegidos e separados por workspace.</p>
        </div>
      </section>
    </main>
  );
}
