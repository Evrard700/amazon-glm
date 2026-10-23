// GET /api/search/suggestions?q=… — suggestions de recherche type marketplace
// (produits + catégories) pour le dropdown de la barre de recherche.
//
// Stratégie anti-latence (Supabase distant ~1 s/requête) :
//  - UNE SEULE requête findMany SANS filtre pour les produits (catalogue petit),
//    idem pour les catégories — les deux en Promise.all (jamais séquentiel) ;
//  - mini-cache local module-level (Map sur globalThis, TTL 30 s, survit au HMR),
//    sans aucune dépendance à un autre fichier ;
//  - filtrage EN MÉMOIRE, insensible à la casse ET aux accents (NFD).
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, ApiError } from "@/lib/api"

const qSchema = z.string().max(100, "recherche trop longue (100 caractères maximum)")

// ---------- Mini-cache local (30 s) ----------

interface ProductRow {
  name: string
  slug: string
  price: number
  salePrice: number | null
  imagesJson: string
  ratingAvg: number
  type: string
  stock: number
  trackInventory: boolean
  salesCount: number
  isFeatured: boolean
  tagsJson: string
  status: string
  deletedAt: Date | null
}

interface CategoryRow {
  name: string
  slug: string
  isActive: boolean
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const CACHE_TTL_MS = 30_000

const globalForSuggestions = globalThis as typeof globalThis & {
  __tmSuggestProducts?: CacheEntry<ProductRow[]>
  __tmSuggestCategories?: CacheEntry<CategoryRow[]>
}

function readCache<T>(entry: CacheEntry<T> | undefined): T | undefined {
  return entry && entry.expiresAt > Date.now() ? entry.value : undefined
}

async function loadProducts(): Promise<ProductRow[]> {
  const cachedRows = readCache(globalForSuggestions.__tmSuggestProducts)
  if (cachedRows) return cachedRows
  const rows = await db.product.findMany({
    select: {
      name: true,
      slug: true,
      price: true,
      salePrice: true,
      imagesJson: true,
      ratingAvg: true,
      type: true,
      stock: true,
      trackInventory: true,
      salesCount: true,
      isFeatured: true,
      tagsJson: true,
      status: true,
      deletedAt: true,
    },
  })
  globalForSuggestions.__tmSuggestProducts = { value: rows, expiresAt: Date.now() + CACHE_TTL_MS }
  return rows
}

async function loadCategories(): Promise<CategoryRow[]> {
  const cachedRows = readCache(globalForSuggestions.__tmSuggestCategories)
  if (cachedRows) return cachedRows
  const rows = await db.category.findMany({ select: { name: true, slug: true, isActive: true } })
  globalForSuggestions.__tmSuggestCategories = { value: rows, expiresAt: Date.now() + CACHE_TTL_MS }
  return rows
}

// ---------- Helpers ----------

/** Normalisation : minuscules + suppression des diacritiques (é → e). */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
  } catch {
    return []
  }
}

// ---------- Route ----------

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    const parsed = qSchema.safeParse(url.searchParams.get("q") ?? "")
    if (!parsed.success) throw new ApiError("Recherche invalide : 100 caractères maximum.", 422)
    const q = fold(parsed.data)
    if (q.length < 2) return ok({ products: [], categories: [] })

    const [products, categories] = await Promise.all([loadProducts(), loadCategories()])

    const matchedProducts = products
      .filter((p) => p.status === "ACTIVE" && p.deletedAt === null)
      .filter((p) => !(p.trackInventory && p.stock <= 0)) // ne suggère pas l'épuisé
      .filter((p) => {
        if (fold(p.name).includes(q)) return true
        return parseStringArray(p.tagsJson).some((tag) => fold(tag).includes(q))
      })
      .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.salesCount - a.salesCount)
      .slice(0, 8)
      .map((p) => ({
        name: p.name,
        slug: p.slug,
        price: p.price,
        salePrice: p.salePrice,
        image: parseStringArray(p.imagesJson)[0] ?? null,
        rating: p.ratingAvg,
        type: p.type,
      }))

    const matchedCategories = categories
      .filter((c) => c.isActive && fold(c.name).includes(q))
      .slice(0, 3)
      .map((c) => ({ name: c.name, slug: c.slug }))

    return ok({ products: matchedProducts, categories: matchedCategories })
  })
}
