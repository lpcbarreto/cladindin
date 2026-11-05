/**
 * Política de conteúdo (CSP) com nonce: só roda script que o próprio servidor marcou nesta resposta.
 * Um script injetado (XSS) não tem o nonce e é bloqueado pelo navegador.
 * Roda no middleware (edge): sem dependências de Node.
 */
export function buildCsp(nonce: string) {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const isProd = process.env.NODE_ENV === "production";
  return [
    "default-src 'self'",
    // 'strict-dynamic': scripts carregados por um script confiável também são aceitos (chunks do Next)
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    // Estilos inline (atributo style do React) continuam permitidos: não executam código
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    // pwnedpasswords: checagem de senha vazada (só 5 caracteres do hash saem do navegador)
    `connect-src 'self' ${supabase} ${supabase.replace("https://", "wss://")} https://api.pwnedpasswords.com`,
    // Prévia de comprovante em PDF (link temporário do Storage)
    `object-src ${supabase}`,
    `frame-src ${supabase}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Nonce aleatório de 128 bits em base64. */
export function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
