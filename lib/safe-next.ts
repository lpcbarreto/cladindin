/**
 * Destino interno seguro para redirecionar depois do login.
 * Recusa "//site", "/\site" (o navegador trata a barra invertida como "/"), espaços/tabs e qualquer coisa
 * que resolva para outro domínio — evita usar o Cladindin como trampolim para phishing.
 */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || /[\\\s]/.test(value) || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, "https://interno.invalid");
    return url.origin === "https://interno.invalid" ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
