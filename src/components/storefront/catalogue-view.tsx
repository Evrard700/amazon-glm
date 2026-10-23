// ============================================================================
// CATALOGUE — composant serveur partagé entre /catalogue et /categories/[slug].
// Filtres par liens (searchParams) : q, category, collection, type, min/max,
// filter=promo, inStock ; tri (popular|recent|price-asc|price-desc|rating) ;
// pagination 24/page ; sidebar sticky desktop + Sheet mobile.
// Données : UNE lecture du cache catalogue (src/lib/catalog-data) puis
// filtrage/tri/pagination EN MÉMOIRE — sémantique identique aux requêtes
// Prisma d'origine (mêmes filtres, mêmes clés de tri, même pagination).
// ============================================================================
import Link from "next/link"
import { Check, PackageSearch, Tag, X } from "lucide-react"
import {
  getCatalog,
  getCategories,
  getCollections,
  type CatalogProduct,
} from "@/lib/catalog-data"
import { formatXOF } from "@/lib/money"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/storefront/empty-state"
import { ProductCard } from "@/components/storefront/product-card"
import { toProductCardData } from "@/components/storefront/map-product"
import { cn } from "@/lib/utils"
import {
  buildCatalogueUrl,
  CATALOGUE_PAGE_SIZE,
  firstValue,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  type CatalogueParams,
} from "./catalogue-params"
import { CataloguePagination } from "./catalogue-pagination"
import { MobileFilters, PriceForm, SortSelect } from "./catalogue-controls"

export interface PresetCategory {
  slug: string
  name: string
}

/**
 * Comparateurs de tri — reproduction des orderBy Prisma d'origine
 * (popular: salesCount desc puis createdAt desc ; recent: createdAt desc ;
 * price-asc/desc ; rating: ratingAvg desc puis ratingCount desc).
 * Tie-break final sur l'id : ordre déterministe, là où la DB laissait
 * un ordre arbitraire pour les égalités.
 */
function compareProducts(a: CatalogProduct, b: CatalogProduct, sort: string): number {
  const byId = a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  switch (sort) {
    case "recent":
      return b.createdAt.getTime() - a.createdAt.getTime() || byId
    case "price-asc":
      return a.price - b.price || byId
    case "price-desc":
      return b.price - a.price || byId
    case "rating":
      return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount || byId
    default:
      // popular
      return b.salesCount - a.salesCount || b.createdAt.getTime() - a.createdAt.getTime() || byId
  }
}

/** Filtre EN MÉMOIRE reproduisant exactement le `where` Prisma d'origine. */
function filterProducts(
  products: CatalogProduct[],
  categoryIdsBySlug: Map<string, string>,
  collectionIdsBySlug: Map<string, string>,
  params: {
    q: string
    activeCategorySlug: string
    collectionSlug: string
    type: string
    min: number | undefined
    max: number | undefined
    promo: boolean
    inStock: boolean
  },
): CatalogProduct[] {
  let items = products

  if (params.q) {
    // OR: name contains | shortDescription contains | tagsJson contains
    // (sous-chaîne, comme le `contains` Prisma sur PostgreSQL)
    const q = params.q
    items = items.filter(
      (p) =>
        p.name.includes(q) ||
        (p.shortDescription != null && p.shortDescription.includes(q)) ||
        p.tagsJson.includes(q),
    )
  }
  if (params.activeCategorySlug) {
    // categories: some category.slug — slug inconnu → aucun produit
    const categoryId = categoryIdsBySlug.get(params.activeCategorySlug)
    items = categoryId ? items.filter((p) => p.categoryIds.includes(categoryId)) : []
  }
  if (params.collectionSlug) {
    const collectionId = collectionIdsBySlug.get(params.collectionSlug)
    items = collectionId ? items.filter((p) => p.collectionIds.includes(collectionId)) : []
  }
  if (params.type) items = items.filter((p) => p.type === params.type)
  if (params.min !== undefined) items = items.filter((p) => p.price >= (params.min as number))
  if (params.max !== undefined) items = items.filter((p) => p.price <= (params.max as number))
  if (params.promo) items = items.filter((p) => p.salePrice !== null)
  if (params.inStock) {
    // OR: DIGITAL | !trackInventory | stock > 0
    items = items.filter((p) => p.type === "DIGITAL" || !p.trackInventory || p.stock > 0)
  }
  return items
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

// ---------- Briques UI ----------

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

function FilterLink({
  href,
  active,
  disabled,
  children,
}: {
  href: string
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm transition",
        active ? "bg-brand-soft font-semibold text-brand-foreground" : "hover:bg-secondary",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <span className="truncate">{children}</span>
      {active && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
    </Link>
  )
}

function ActiveChip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium shadow-sm transition hover:bg-secondary"
      title="Retirer ce filtre"
    >
      {children}
      <X className="h-3 w-3" aria-hidden />
    </Link>
  )
}

// ---------- Vue principale ----------

export async function CatalogueView({
  searchParams,
  basePath,
  presetCategory,
  title,
  subtitle,
}: {
  searchParams: CatalogueParams
  basePath: string
  presetCategory?: PresetCategory | null
  title: string
  subtitle?: string
}) {
  // ---- État des filtres ----
  const q = (firstValue(searchParams.q) ?? "").trim()
  const activeCategorySlug = presetCategory?.slug ?? firstValue(searchParams.category) ?? ""
  const collectionSlug = firstValue(searchParams.collection) ?? ""
  const type = TYPE_OPTIONS.find((t) => t.value === firstValue(searchParams.type))?.value ?? ""
  const min = parseNumber(firstValue(searchParams.min))
  const max = parseNumber(firstValue(searchParams.max))
  const promo = firstValue(searchParams.filter) === "promo"
  const inStock = firstValue(searchParams.inStock) === "1"
  const sort = SORT_OPTIONS.find((s) => s.value === firstValue(searchParams.sort))?.value ?? "popular"
  const requestedPage = Math.max(1, parseNumber(firstValue(searchParams.page)) ?? 1)

  // ---- Données (cache catalogue) + filtrage/tri/pagination en mémoire ----
  const [allProducts, allCategories, allCollections] = await Promise.all([
    getCatalog(),
    getCategories(),
    getCollections(),
  ])

  // Racines actives pour la sidebar (identique à la requête d'origine)
  const categories = allCategories
    .filter((c) => c.parentId === null)
    .map((c) => ({ name: c.name, slug: c.slug }))
  const collections = allCollections.map((c) => ({ name: c.name, slug: c.slug }))

  // slug → id pour les filtres par catégorie/collection (toutes catégories,
  // y compris les enfants — comme le `some` Prisma d'origine)
  const categoryIdsBySlug = new Map(allCategories.map((c) => [c.slug, c.id]))
  const collectionIdsBySlug = new Map(allCollections.map((c) => [c.slug, c.id]))

  const filtered = filterProducts(allProducts, categoryIdsBySlug, collectionIdsBySlug, {
    q,
    activeCategorySlug,
    collectionSlug,
    type,
    min,
    max,
    promo,
    inStock,
  })

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / CATALOGUE_PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)
  const products = [...filtered]
    .sort((a, b) => compareProducts(a, b, sort))
    .slice((page - 1) * CATALOGUE_PAGE_SIZE, page * CATALOGUE_PAGE_SIZE)

  const activeCategory = categories.find((c) => c.slug === activeCategorySlug) ?? null
  const activeCollection = collections.find((c) => c.slug === collectionSlug) ?? null
  const activeType = TYPE_OPTIONS.find((t) => t.value === type) ?? null
  const hasFilters =
    Boolean(q || activeCategory || activeCollection || activeType || promo || inStock || min !== undefined || max !== undefined)

  // ---- Sidebar (partagée desktop / mobile) ----
  const sidebarContent = (
    <div className="space-y-5">
      <FilterGroup title="Catégories">
        <div className="space-y-0.5">
          <FilterLink
            href={buildCatalogueUrl("/catalogue", searchParams, { category: null })}
            active={!activeCategory}
          >
            Toutes les catégories
          </FilterLink>
          {categories.map((cat) => (
            <FilterLink
              key={cat.slug}
              href={buildCatalogueUrl("/catalogue", searchParams, { category: cat.slug })}
              active={activeCategorySlug === cat.slug}
            >
              {cat.name}
            </FilterLink>
          ))}
        </div>
      </FilterGroup>

      {collections.length > 0 && (
        <FilterGroup title="Collections">
          <div className="space-y-0.5">
            <FilterLink
              href={buildCatalogueUrl(basePath, searchParams, { collection: null })}
              active={!collectionSlug}
            >
              Toutes les collections
            </FilterLink>
            {collections.map((col) => (
              <FilterLink
                key={col.slug}
                href={buildCatalogueUrl(basePath, searchParams, { collection: col.slug })}
                active={collectionSlug === col.slug}
              >
                {col.name}
              </FilterLink>
            ))}
          </div>
        </FilterGroup>
      )}

      <FilterGroup title="Type de produit">
        <div className="space-y-0.5">
          {TYPE_OPTIONS.map((t) => (
            <FilterLink
              key={t.value}
              href={buildCatalogueUrl(basePath, searchParams, { type: t.value })}
              active={type === t.value}
            >
              {t.label}
            </FilterLink>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Prix (FCFA)">
        <PriceForm basePath={basePath} params={searchParams} currentMin={min} currentMax={max} />
      </FilterGroup>

      <FilterGroup title="Disponibilité">
        <div className="space-y-0.5">
          <FilterLink
            href={buildCatalogueUrl(basePath, searchParams, { filter: promo ? null : "promo" })}
            active={promo}
          >
            <span className="inline-flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-brand-foreground" aria-hidden /> En promotion
            </span>
          </FilterLink>
          <FilterLink
            href={buildCatalogueUrl(basePath, searchParams, { inStock: inStock ? null : "1" })}
            active={inStock}
          >
            En stock uniquement
          </FilterLink>
        </div>
      </FilterGroup>
    </div>
  )

  return (
    <div>
      {/* En-tête */}
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total} {total > 1 ? "produits" : "produit"}
          {subtitle ? ` — ${subtitle}` : ""}
        </p>
      </div>

      {/* Barre d'outils : filtres mobile + chips actifs + tri */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <MobileFilters>{sidebarContent}</MobileFilters>

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {q && (
              <ActiveChip href={buildCatalogueUrl(basePath, searchParams, { q: null })}>
                <span className="max-w-32 truncate">« {q} »</span>
              </ActiveChip>
            )}
            {!presetCategory && activeCategory && (
              <ActiveChip href={buildCatalogueUrl("/catalogue", searchParams, { category: null })}>
                {activeCategory.name}
              </ActiveChip>
            )}
            {activeCollection && (
              <ActiveChip href={buildCatalogueUrl(basePath, searchParams, { collection: null })}>
                {activeCollection.name}
              </ActiveChip>
            )}
            {activeType && (
              <ActiveChip href={buildCatalogueUrl(basePath, searchParams, { type: null })}>
                {activeType.label}
              </ActiveChip>
            )}
            {(min !== undefined || max !== undefined) && (
              <ActiveChip href={buildCatalogueUrl(basePath, searchParams, { min: null, max: null })}>
                {min !== undefined ? formatXOF(min) : "0"}
                {" – "}
                {max !== undefined ? formatXOF(max) : "∞"}
              </ActiveChip>
            )}
            {promo && (
              <ActiveChip href={buildCatalogueUrl(basePath, searchParams, { filter: null })}>
                En promotion
              </ActiveChip>
            )}
            {inStock && (
              <ActiveChip href={buildCatalogueUrl(basePath, searchParams, { inStock: null })}>
                En stock
              </ActiveChip>
            )}
            <Link
              href={basePath}
              className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Tout effacer
            </Link>
          </div>
        )}

        <div className="ml-auto">
          <SortSelect basePath={basePath} params={searchParams} value={sort} />
        </div>
      </div>

      {/* Sidebar + grille */}
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block" aria-label="Filtres">
          <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">{sidebarContent}</div>
        </aside>

        <div className="min-w-0">
          {products.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Aucun produit trouvé"
              description="Vos filtres sont trop restrictifs. Élargissez votre recherche ou explorez l'ensemble du catalogue."
              action={
                <Button asChild className="bg-brand text-brand-foreground hover:brightness-95">
                  <Link href={basePath}>Réinitialiser les filtres</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p, i) => (
                <ProductCard key={p.id} product={toProductCardData(p)} priority={i < 8} />
              ))}
            </div>
          )}

          <CataloguePagination basePath={basePath} params={searchParams} page={page} totalPages={totalPages} />
        </div>
      </div>
    </div>
  )
}
