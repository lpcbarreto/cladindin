/** Nome curto do aparelho a partir do navegador informado (ex.: "Chrome no Windows"). Sem versão nem identificadores. */
export function describeDevice(ua: string | null | undefined) {
  if (!ua) return "Aparelho desconhecido";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} no ${os}` : browser;
}

/**
 * Acesso de aparelho novo: a pessoa já entrou antes (com aparelho registrado) e nunca por este.
 * Primeiro acesso da vida, ou só registros antigos sem aparelho, não contam (evita alarme falso).
 */
export function isNewDevice(previous: (string | null)[], device: string) {
  const known = previous.filter((d): d is string => Boolean(d));
  return known.length > 0 && !known.includes(device);
}
