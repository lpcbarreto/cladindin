import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LegalFooter } from "@/components/legal-footer";
import { missingLegalFields } from "@/lib/legal";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const missing = missingLegalFields();
  return (
    <div className="min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
        Pular para o conteúdo
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" aria-label="Cladindin, início">
            <Logo size={26} />
          </Link>
          <div className="w-32">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="conteudo" className="page-enter mx-auto max-w-3xl px-4 py-10">
        {missing.length > 0 && (
          <p role="note" className="mb-6 rounded-[10px] border border-border bg-surface-2 p-3 text-sm text-muted">
            Documento com dados do responsável ainda a preencher ({missing.length} campo(s) entre colchetes).
          </p>
        )}
        <article className="legal space-y-5 text-[15px] leading-relaxed">{children}</article>
        <div className="mt-12">
          <LegalFooter />
        </div>
      </main>
    </div>
  );
}
