import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/w/", "/api/", "/auth/", "/convite/", "/redefinir-senha", "/login/mfa"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
