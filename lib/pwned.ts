/**
 * A senha já apareceu em vazamentos conhecidos? Usa o Have I Been Pwned por "k-anonimato":
 * só os 5 primeiros caracteres do hash SHA-1 saem do navegador — nunca a senha nem o hash inteiro.
 * Se o serviço estiver fora do ar, não bloqueia (devolve 0).
 */
export async function pwnedCount(password: string): Promise<number> {
  try {
    const bytes = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
    const hash = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return 0;
    const suffix = hash.slice(5);
    for (const line of (await res.text()).split("\n")) {
      const [s, n] = line.trim().split(":");
      if (s === suffix) return Number(n) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/** Regras mínimas de senha do Cladindin (antes de consultar vazamentos). */
export function weakPasswordReason(password: string): string | null {
  if (password.length < 8) return "A senha precisa ter ao menos 8 caracteres.";
  if (/^(.)\1+$/.test(password) || /^(?:0123456789|12345678|123456789|87654321|abcdefgh|qwertyui|password|senha123)/i.test(password)) {
    return "Essa senha é fácil demais de adivinhar. Escolha outra.";
  }
  return null;
}
