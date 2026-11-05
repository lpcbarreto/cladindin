import { LEGAL } from "@/lib/legal";
import { siteUrl } from "@/lib/site-url";

/** RFC 9116: onde pesquisadores de segurança reportam falhas. Validade de 1 ano a partir da versão dos documentos. */
export function GET() {
  const expires = new Date(`${LEGAL.versao}T00:00:00Z`);
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  const body = [
    `Contact: mailto:${LEGAL.emailContato}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: pt-BR, en",
    `Canonical: ${siteUrl()}/.well-known/security.txt`,
    `Policy: ${siteUrl()}/privacidade`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
