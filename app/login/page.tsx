import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo, LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

const HIGHLIGHTS = [
  "Importe extratos OFX sem duplicar nada",
  "Contas a pagar e a receber num só lugar",
  "Pessoal e empresa separados, com login para cada pessoa",
];

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
      <div className="absolute top-4 right-4 z-20 w-32">
        <ThemeToggle />
      </div>
      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-fg lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <span className="rounded-full bg-primary-fg/15 p-1">
            <LogoMark size={36} />
          </span>
          cladindin
        </div>
        <div className="relative z-10 max-w-md space-y-6">
          <h1 className="text-4xl leading-tight font-extrabold">Seu dindin organizado, sem planilha e sem susto.</h1>
          <ul className="space-y-3 text-base">
            {HIGHLIGHTS.map((h) => (
              <li key={h} className="flex items-start gap-3">
                <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-foreground">✓</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-sm opacity-75">Finanças pessoais e da sua pequena empresa.</p>
        {/* Moedas decorativas */}
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full border-[28px] border-primary-fg/10" />
        <div aria-hidden="true" className="pointer-events-none absolute top-24 -right-10 h-40 w-40 rounded-full bg-accent/25" />
      </section>

      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <Logo size={40} />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold">Que bom te ver!</h2>
            <p className="text-sm text-muted">Entre para acessar suas finanças.</p>
          </div>
          {erro && <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{erro}</p>}
          <div className="card">
            <LoginForm next={safeNext} />
          </div>
        </div>
      </section>
    </main>
  );
}
