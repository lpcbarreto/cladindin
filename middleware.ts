import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hardenCookie } from "@/lib/supabase/cookies";
import { buildCsp, makeNonce } from "@/lib/csp";

const PUBLIC_PATHS = ["/login", "/auth", "/convite", "/api/cron", "/api/erros", "/manifest.webmanifest", "/pwa-icon", "/sw.js", "/offline.html", "/termos", "/privacidade", "/cookies", "/reembolso", "/lgpd", "/acessibilidade", "/ajuda", "/api/saude", "/robots.txt", "/sitemap.xml", "/opengraph-image", "/.well-known"];

export async function middleware(request: NextRequest) {
  // Nonce novo a cada requisição: o Next marca os próprios scripts com ele (lendo o CSP da requisição)
  const nonce = makeNonce();
  const csp = buildCsp(nonce);
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  const next = () => {
    const r = NextResponse.next({ request: { headers: request.headers } });
    r.headers.set("Content-Security-Policy", csp);
    return r;
  };
  let response = next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = next();
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, hardenCookie(options)));
        },
      },
    },
  );

  // getClaims valida o JWT localmente (ES256) e renova a sessão quando expira; sem ida à rede a cada clique
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;
  const path = request.nextUrl.pathname;
  // "/" é a página inicial pública; as demais rotas públicas são prefixos
  if (!user && path !== "/" && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|ico|html|js)$).*)"],
};
