/** Endereço público do site (para SEO e links absolutos). */
export function siteUrl() {
  const official = process.env.NEXT_PUBLIC_SITE_URL;
  if (official && !official.includes("localhost")) return official.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}
