// Section publique GRILLE DE PRODUITS — data-driven (db).
// Sources : featured | new | sale | collection.
// Les produits viennent du cache catalogue mémoire (src/lib/catalog-data),
// filtrés/triés en mémoire — strictement les mêmes règes qu'avant.
import { getCatalog, getCollections, type CatalogProduct } from "@/lib/catalog-data"
import { ProductCard } from "@/components/storefront/product-card"
import { toProductCardData } from "@/components/storefront/map-product"
import { cn } from "@/lib/utils"
import { Container, num, str } from "./section-ui"
import { SectionHeading, SeeAllLink } from "./section-ui"
import { Reveal } from "./Reveal"

const COLUMNS_CLASS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-3 lg:grid-cols-4",
}

/** Tri stable (le tie-break final sur id garantit un ordre déterministe). */
function compareCreatedAtDesc(a: CatalogProduct, b: CatalogProduct): number {
  if (b.createdAt.getTime() !== a.createdAt.getTime()) return b.createdAt.getTime() - a.createdAt.getTime()
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export async function ProductGridSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title)
  const source = str(props.source, "featured")
  const collectionSlug = str(props.collectionSlug)
  const count = num(props.count, 8, 1, 12)
  const columns = num(props.columns, 4, 2, 4)

  let seeHref = "/catalogue"

  // Base identique à l'ancienne requête : { status: "ACTIVE", deletedAt: null }
  let products: CatalogProduct[]
  switch (source) {
    case "new":
      // orderBy: createdAt desc
      products = [...(await getCatalog())].sort(compareCreatedAtDesc)
      seeHref = "/catalogue?sort=recent"
      break
    case "sale": {
      // where salePrice not null, orderBy: updatedAt desc
      products = (await getCatalog())
        .filter((p) => p.salePrice !== null)
        .sort((a, b) => {
          if (b.updatedAt.getTime() !== a.updatedAt.getTime()) return b.updatedAt.getTime() - a.updatedAt.getTime()
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
        })
      seeHref = "/catalogue?filter=promo"
      break
    }
    case "collection": {
      if (!collectionSlug) return null
      // where collections.some(collection.slug) — si la collection est
      // introuvable/inactive : aucun produit (comportement d'origine).
      const collections = await getCollections()
      const collectionId = collections.find((c) => c.slug === collectionSlug)?.id ?? null
      products = collectionId
        ? (await getCatalog()).filter((p) => p.collectionIds.includes(collectionId))
        : []
      seeHref = `/catalogue?collection=${encodeURIComponent(collectionSlug)}`
      break
    }
    default: {
      // where isFeatured: true, orderBy: salesCount desc
      products = (await getCatalog())
        .filter((p) => p.isFeatured)
        .sort((a, b) => b.salesCount - a.salesCount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      break
    }
  }

  const visible = products.slice(0, count)
  if (visible.length === 0) return null

  return (
    <Container className="py-10">
      <SectionHeading title={title} action={<SeeAllLink href={seeHref} />} />
      <Reveal>
        <div
          className={cn(
            "grid grid-cols-2 gap-3",
            COLUMNS_CLASS[columns] ?? COLUMNS_CLASS[4],
          )}
        >
          {visible.map((p) => (
            <ProductCard key={p.id} product={toProductCardData(p)} />
          ))}
        </div>
      </Reveal>
    </Container>
  )
}
