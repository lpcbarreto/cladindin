import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";
import { LEGAL } from "@/lib/legal";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const lastModified = new Date(`${LEGAL.versao}T12:00:00Z`);
  return ["", "/login", "/ajuda", "/termos", "/privacidade", "/cookies", "/reembolso", "/lgpd", "/acessibilidade"].map((p) => ({
    url: `${base}${p}`,
    lastModified,
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : 0.5,
  }));
}
