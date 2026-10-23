import type { MetadataRoute } from "next"
import { headers } from "next/headers"

// robots.txt dynamique : URL de sitemap ABSOLUE (exigence de la
// spécification — les crawlers ignorent les chemins relatifs).
// Origine : NEXT_PUBLIC_SITE_URL, sinon hôte de la requête (proxy inclus).

export const dynamic = "force-dynamic"

async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/+$/, "")
  try {
    const h = await headers()
    const host = h.get("x-forwarded-host") ?? h.get("host")
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")
      return `${proto}://${host}`
    }
  } catch {
    // Pas de contexte de requête : repli.
  }
  return "http://localhost:3000"
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteUrl()
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      // L'administration et les API privées n'ont rien à indexer.
      { userAgent: "*", disallow: ["/admin", "/admin/", "/api/", "/account/", "/checkout"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
