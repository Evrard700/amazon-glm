import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { db } from "@/lib/db"

// Sitemap dynamique : routes statiques + pages publiées + catégories actives
// + produits actifs non supprimés. Requêtes DB regroupées en Promise.all
// (Supabase distant : on limite les allers-retours).

export const dynamic = "force-dynamic"

/** Origine absolue du site : en-têtes de la requête (proxy compris) sinon repli local. */
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteUrl()
  const now = new Date()

  const [publishedPages, activeCategories, activeProducts] = await Promise.all([
    db.page.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
    }),
    db.category.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
      orderBy: { position: "asc" },
    }),
    db.product.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: { slug: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ])

  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${base}/catalogue`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/login`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/register`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/cart`, changeFrequency: "monthly", priority: 0.4 },
  ]

  // Pages éditoriales publiées (la home est déjà listée ci-dessus).
  for (const page of publishedPages) {
    if (page.slug === "home") continue
    entries.push({
      url: `${base}/pages/${page.slug}`,
      lastModified: page.updatedAt,
      changeFrequency: "monthly",
      priority: 0.5,
    })
  }

  for (const category of activeCategories) {
    entries.push({
      url: `${base}/categories/${category.slug}`,
      lastModified: category.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    })
  }

  for (const product of activeProducts) {
    entries.push({
      url: `${base}/products/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
    })
  }

  return entries
}
