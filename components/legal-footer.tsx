import Link from "next/link";
import { LEGAL, LEGAL_LINKS } from "@/lib/legal";

/** Rodapé com links legais e identificação do fornecedor (Decreto 7.962/2013, art. 2º). */
export function LegalFooter({ compact = false }: { compact?: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`text-xs text-muted ${compact ? "space-y-2" : "space-y-3 border-t border-border pt-6"}`}>
      <nav aria-label="Documentos legais" className="flex flex-wrap gap-x-4 gap-y-1.5">
        {LEGAL_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="underline-offset-2 hover:text-foreground hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>
      <p>
        © {year} {LEGAL.razaoSocial}
        {LEGAL.cnpj && <> · CNPJ {LEGAL.cnpj}</>}
        {!compact && (
          <>
            {" "}
            · {LEGAL.endereco} · <a href={`mailto:${LEGAL.emailContato}`} className="underline-offset-2 hover:underline">{LEGAL.emailContato}</a>
          </>
        )}
      </p>
    </footer>
  );
}
