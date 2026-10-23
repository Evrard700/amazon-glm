// ============================================================================
// LECTEURS CATALOGUE PARTAGÉS (storefront) — mise en cache mémoire TTL via
// @/lib/cache pour absorber la latence de la base Supabase distante.
// Clés : "settings" 30 s, "categories" 60 s, "catalog" 15 s,
// "catalog:collections" 30 s, "reviews:latest" 30 s.
// Invalidation : voir les routes admin (invalidateCache) et services commandes.
// Le filtrage / tri / pagination du catalogue se fait ensuite EN MÉMOIRE
// (src/components/storefront/catalogue-view.tsx).
// ============================================================================
import { db } from "@/lib/db"
import { cached } from "@/lib/cache"

export const SETTINGS_TTL_MS = 30_000
export const CATEGORIES_TTL_MS = 60_000
export const CATALOG_TTL_MS = 15_000
export const COLLECTIONS_TTL_MS = 30_000
export const REVIEWS_TTL_MS = 30_000

// ---------- Types des payloads en cache ----------

export interface CatalogProduct {
  id: string
  name: string
  slug: string
  shortDescription: string | null
  type: string
  price: number
  salePrice: number | null
  stock: number
  trackInventory: boolean
  sku: string | null
  requiresShipping: boolean
  digitalFileName: string | null
  imagesJson: string
  tagsJson: string
  isFeatured: boolean
  salesCount: number
  ratingAvg: number
  ratingCount: number
  createdAt: Date
  updatedAt: Date
  /** Identifiants des catégories liées (relation productCategory) */
  categoryIds: string[]
  /** Identifiants des collections liées (relation productCollection) */
  collectionIds: string[]
}

export interface CategoryData {
  id: string
  name: string
  slug: string
  description: string | null
  imageUrl: string | null
  parentId: string | null
  position: number
}

export interface CollectionData {
  id: string
  name: string
  slug: string
  description: string | null
  imageUrl: string | null
  position: number
  productsCount: number
}

export interface LatestReviewData {
  id: string
  rating: number
  title: string | null
  comment: string
  authorName: string
  isVerifiedBuyer: boolean
  createdAt: Date
  product: { name: string; slug: string; imagesJson: string }
}

// ---------- Chargeurs mis en cache ----------

/** Paramètres de la boutique (identité, seuils, annonce…) — clé "settings". */
export function getSettings() {
  // SWR 5 min : périmée → servie immédiatement, actualisée en tâche de fond
  // (les mutations purge explicitement "settings").
  return cached(
    "settings",
    SETTINGS_TTL_MS,
    () => db.storeSettings.findUniqueOrThrow({ where: { id: 1 } }),
    300_000,
  )
}

/**
 * Toutes les catégories ACTIVES (racines et enfants), triées par position.
 * Les consommateurs filtrent `parentId === null` / découpent selon leurs
 * besoins (layout take 7, sections, sidebar, fiche catégorie par slug).
 */
export function getCategories() {
  return cached("categories", CATEGORIES_TTL_MS, async () => {
    const rows = await db.category.findMany({
      where: { isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        parentId: true,
        position: true,
      },
    })
    return rows as CategoryData[]
  }, 300_000)
}

/**
 * Toutes les collections ACTIVES avec leur nombre de produits.
 * Clé "catalog:collections" → purgée par invalidateCache("catalog").
 */
export function getCollections() {
  return cached("catalog:collections", COLLECTIONS_TTL_MS, async () => {
    const rows = await db.collection.findMany({
      where: { isActive: true },
      orderBy: { position: "asc" },
      include: { _count: { select: { products: true } } },
    })
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      position: c.position,
      productsCount: c._count.products,
    })) as CollectionData[]
  }, 300_000)
}

/**
 * Catalogue produit complet visible boutique : statut ACTIVE, non supprimé.
 * UNE requête (relations incluses) remplace les requêtes filtrées du
 * catalogue / sections ; le filtrage se fait ensuite en mémoire.
 */
export function getCatalog() {
  return cached("catalog", CATALOG_TTL_MS, async () => {
    const rows = await db.product.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        shortDescription: true,
        type: true,
        price: true,
        salePrice: true,
        stock: true,
        trackInventory: true,
        sku: true,
        requiresShipping: true,
        digitalFileName: true,
        imagesJson: true,
        tagsJson: true,
        isFeatured: true,
        salesCount: true,
        ratingAvg: true,
        ratingCount: true,
        createdAt: true,
        updatedAt: true,
        categories: { select: { categoryId: true } },
        collections: { select: { collectionId: true } },
      },
      // Ordre de lecture stable, le tri applicatif se fait en mémoire.
      orderBy: { createdAt: "asc" },
    })
    return rows.map((p) => ({
      ...p,
      categoryIds: p.categories.map((l) => l.categoryId),
      collectionIds: p.collections.map((l) => l.collectionId),
    })) as CatalogProduct[]
  }, 300_000)
}

/**
 * Derniers avis APPROVÉS (produits visibles) — section « Avis clients ».
 * 12 = maximum demandable par la section (num(count, 6, 1, 12)).
 */
/**
 * Variantes d'un ensemble de produits — UNE requête, cache 15 s (préfixe
 * « catalog » → purgé par chaque mutation admin produit ET chaque commande
 * qui décrémente le stock des variantes) : toujours fraîche en pratique.
 */
export function getVariantsByIds(productIds: string[]): Promise<
  { id: string; productId: string; name: string; sku: string | null; price: number | null; stock: number; isActive: boolean }[]
> {
  const ids = [...new Set(productIds)].sort()
  if (ids.length === 0) return Promise.resolve([])
  return cached(
    `catalog:variants:${ids.join(",")}`,
    CATALOG_TTL_MS,
    () =>
      db.productVariant.findMany({
        where: { productId: { in: ids } },
        select: { id: true, productId: true, name: true, sku: true, price: true, stock: true, isActive: true },
      }),
    120_000,
  )
}

export function getLatestReviews() {
  return cached("reviews:latest", REVIEWS_TTL_MS, async () => {
    const rows = await db.review.findMany({
      where: { status: "APPROVED", product: { status: "ACTIVE", deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { product: { select: { name: true, slug: true, imagesJson: true } } },
    })
    return rows as unknown as LatestReviewData[]
  }, 300_000)
}
