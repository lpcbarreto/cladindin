// Limite simples em memória por chave (ex.: usuário). Suficiente para uma instância;
// em produção com várias instâncias, trocar por Redis/Upstash.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  return true;
}

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * Limite por usuário guardado no banco (vale para todos os servidores).
 * Se o banco não responder, cai no limite em memória para não travar o app.
 */
export async function userRateLimit(supabase: RpcClient, userId: string, action: string, max: number, windowMs: number): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_action: action,
    p_max: max,
    p_window_seconds: Math.ceil(windowMs / 1000),
  });
  if (error || typeof data !== "boolean") return rateLimit(`${action}:${userId}`, max, windowMs);
  return data;
}
