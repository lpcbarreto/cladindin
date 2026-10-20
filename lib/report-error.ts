/** Envia um erro do navegador para /api/erros (aparece nos logs da Vercel). */
export function reportError(err: unknown, digest?: string) {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const body = JSON.stringify({ name: e.name, message: e.message, path: window.location.pathname, digest });
    if (!navigator.sendBeacon?.("/api/erros", new Blob([body], { type: "application/json" }))) {
      fetch("/api/erros", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
    }
  } catch {
    // relatar erro nunca pode quebrar a página
  }
}
