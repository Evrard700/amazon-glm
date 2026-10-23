// Section publique COLLECTION EN VEDETTE — data-driven (db).
// Collections via le cache mémoire (src/lib/catalog-data).
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Package } from "lucide-react"
import { getCollections } from "@/lib/catalog-data"
import { Container, str } from "./section-ui"
import { Reveal } from "./Reveal"

export async function CollectionHighlightSection({ props }: { props: Record<string, unknown> }) {
  const slug = str(props.collectionSlug)
  const title = str(props.title)
  const text = str(props.text)
  const ctaLabel = str(props.ctaLabel, "Découvrir la collection")
  const imageOverride = str(props.image)

  // findFirst({ where: { slug, isActive: true } }) : le cache ne contient
  // que les collections actives — introuvable ici = null, comme avant.
  const collection = slug ? (await getCollections()).find((c) => c.slug === slug) ?? null : null
  if (!collection) return null

  const image = imageOverride || collection.imageUrl
  const description = text || collection.description

  return (
    <Container className="py-10">
      <div className="grid items-center gap-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-8 lg:grid-cols-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-secondary/40">
          {image ? (
            <Image
              src={image}
              alt={collection.name}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center bg-primary/5 text-muted-foreground">
              <Package className="h-12 w-12" strokeWidth={1.2} aria-hidden />
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-md bg-brand px-2.5 py-1 text-xs font-bold text-brand-foreground shadow">
            Collection
          </span>
        </div>
        <div>
          <Reveal>
            {title && <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>}
            <p className="mt-1 text-sm font-medium text-muted-foreground">{collection.name}</p>
            {description && <p className="mt-3 text-sm leading-relaxed sm:text-base">{description}</p>}
            <p className="mt-3 text-xs font-semibold text-muted-foreground">
              {collection.productsCount} article{collection.productsCount > 1 ? "s" : ""} dans cette collection
            </p>
            <Link
              href={`/catalogue?collection=${encodeURIComponent(collection.slug)}`}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-bold text-brand-foreground shadow-md transition hover:brightness-95 active:scale-[0.98]"
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Reveal>
        </div>
      </div>
    </Container>
  )
}
