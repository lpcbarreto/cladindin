/**
 * Cookies de sessão endurecidos. Como nenhum código do navegador usa mais o Supabase,
 * o token pode ser httpOnly: um script injetado na página não consegue roubá-lo.
 */
export function hardenCookie<T extends Record<string, unknown> | undefined>(options: T) {
  return {
    ...(options ?? {}),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}
