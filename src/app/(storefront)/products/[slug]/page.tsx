// FICHE PRODUIT — /products/[slug] (server) + composants clients :
// galerie, panneau d'achat (variantes), onglets, avis (pagination légère),
// produits similaires, vus récemment, encarts livraison/numérique.
import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import {
  BadgeCheck,
  ChevronRight,
  Download,
  Package,
  ShieldCheck,
  Truck,
} from "lucide-react"
import type { Prisma, Product, Review } from "@prisma/client"
import { db } from "@/lib/db"
import { cached } from "@/lib/cache"
import { getSessionUser } from "@/lib/auth"
import { canReviewProduct } from "@/lib/services/reviews"
import { getSettings } from "@/lib/catalog-data"
import { formatXOF } from "@/lib/money"
import { PRODUCT_TYPE_LABELS } from "@/lib/constants"
import { parseJson } from "@/lib/json"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RatingStars } from "@/components/storefront/rating-stars"
import { ProductCard } from "@/components/storefront/product-card"
import { toProductCardData } from "@/components/storefront/map-product"
import { ProductGallery } from "@/components/storefront/product/gallery"
import { PurchasePanel } from "@/components/storefront/product/purchase-panel"
import { ProductTabs } from "@/components/storefront/product/product-tabs"
import { ReviewForm } from "@/components/storefront/product/review-form"
import { RecentlyViewed } from "@/components/storefront/product/recently-viewed"
import { Reveal } from "@/components/storefront/sections/Reveal"

export const revalidate = 0

const REVIEWS_PER_PAGE = 6

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: { variants: true; categories: { include: { category: true } } }
}>

interface ProductPagePayload {
  product: ProductWithRelations
  /** Tous les avis APPROVED (ordre createdAt desc) — pagination en mémoire. */
  reviews: Review[]
  related: Product[]
}

/**
 * Chargeur groupé de la fiche produit — mis en cache 10 s PAR SLUG.
 * Produit + variantes + catégories en 1 requête, puis avis et produits
 * similaires EN PARALLÈLE. Le metadata et la page partagent la même
 * promesse (anti-stampede) : une seule lecture DB pour les deux.
 */
function loadProductPage(slug: string): Promise<ProductPagePayload | null> {
  return cached(
    `product:${slug}`,
    10_000,
    async () => {
    const product = await db.product.findFirst({
      where: { slug, status: "ACTIVE", deletedAt: null },
      include: {
        variants: { where: { isActive: true }, orderBy: { position: "asc" } },
        categories: { include: { category: true } },
      },
    })
    if (!product) return null

    const [reviews, related] = await Promise.all([
      db.review.findMany({
        where: { productId: product.id, status: "APPROVED" },
        orderBy: { createdAt: "desc" },
      }),
      (async () => {
        const relatedIds = parseJson<string[]>(product.relatedIdsJson, [])
        let result: Product[] = []
        if (relatedIds.length > 0) {
          result = await db.product.findMany({
            where: { id: { in: relatedIds }, status: "ACTIVE", deletedAt: null, NOT: { id: product.id } },
            take: 4,
            orderBy: { salesCount: "desc" },
          })
        }
        if (result.length === 0) {
          const mainCategory = product.categories[0]?.category ?? null
          result = await db.product.findMany({
            where: {
              status: "ACTIVE",
              deletedAt: null,
              NOT: { id: product.id },
              ...(mainCategory
                ? { categories: { some: { categoryId: mainCategory.id } } }
                : { isFeatured: true }),
            },
            orderBy: { salesCount: "desc" },
            take: 4,
          })
        }
        return result
      })(),
    ])

    return { product, reviews, related }
    },
    600_000,
  )
}

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const payload = await loadProductPage(slug)
  if (!payload) return { title: "Produit introuvable" }
  const product = payload.product
  const images = parseJson<string[]>(product.imagesJson, [])
  const description =
    product.shortDescription ?? product.description.replace(/<[^>]+>/g, "").slice(0, 155)
  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      images: images[0] ? [images[0]] : [],
      type: "website",
    },
  }
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])

  // Payload en cache + session en parallèle (1 aller-retour à chaud)
  const [payload, user, settings] = await Promise.all([
    loadProductPage(slug),
    getSessionUser(),
    getSettings(),
  ])
  if (!payload) notFound()
  const { product, related } = payload

  // Compteur de vues — best effort silencieux
  void db.product
    .update({ where: { id: product.id }, data: { viewsCount: { increment: 1 } } })
    .catch(() => {})

  // ---- Avis (APPROVED) + pagination légère (découpage en mémoire) ----
  const allReviews = payload.reviews
  const reviewsTotal = allReviews.length
  const reviewsPages = Math.max(1, Math.ceil(reviewsTotal / REVIEWS_PER_PAGE))
  const reviewsPage = Math.min(
    Math.max(1, Number.parseInt(firstValue(sp.rev) ?? "1", 10) || 1),
    reviewsPages,
  )
  const currentReviewPage = reviewsPage
  const reviews = allReviews.slice((reviewsPage - 1) * REVIEWS_PER_PAGE, reviewsPage * REVIEWS_PER_PAGE)

  // ---- Droits à publier un avis (dépend de la session, hors cache) ----
  let alreadyReviewed = false
  let canReview = false
  if (user) {
    const [already, eligible] = await Promise.all([
      db.review.findFirst({ where: { productId: product.id, userId: user.id }, select: { id: true } }),
      canReviewProduct(user.id, product.id),
    ])
    alreadyReviewed = Boolean(already)
    canReview = alreadyReviewed ? false : eligible
  }

  const onSale = product.salePrice != null && product.salePrice < product.price
  const isDigital = product.type === "DIGITAL"
  const isHybrid = product.type === "HYBRID"
  const mainCategory = product.categories[0]?.category ?? null

  // ---- Données produit ----
  const images = parseJson<string[]>(product.imagesJson, [])
  const tags = parseJson<string[]>(product.tagsJson, [])
  const attributes = parseJson<{ name?: string; values?: unknown }[]>(product.attributesJson, [])

  // ---- Badges de la galerie ----
  const galleryBadges = (
    <>
      {onSale && (
        <Badge className="bg-brand text-brand-foreground shadow-sm">
          -{Math.round(((product.price - (product.salePrice as number)) / product.price) * 100)} %
        </Badge>
      )}
      {isDigital && (
        <Badge variant="secondary" className="bg-card/95 shadow-sm">
          <Download className="mr-1 h-3 w-3" aria-hidden /> Numérique
        </Badge>
      )}
      {isHybrid && (
        <Badge variant="secondary" className="bg-card/95 shadow-sm">
          <Package className="mr-1 h-3 w-3" aria-hidden /> Hybride
        </Badge>
      )}
    </>
  )

  // ---- Onglets : description ----
  const descriptionTab = (
    <div className="max-w-3xl space-y-4">
      {product.shortDescription && (
        <p className="text-sm font-medium sm:text-base">{product.shortDescription}</p>
      )}
      {product.description
        .split(/\n+/)
        .filter((p) => p.trim().length > 0)
        .map((paragraph, i) => (
          <p key={i} className="text-sm leading-7 text-foreground/90 sm:text-base">
            {paragraph}
          </p>
        ))}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2">
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/catalogue?q=${encodeURIComponent(tag)}`}
              className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-brand-soft hover:text-brand-foreground"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </div>
  )

  // ---- Onglets : caractéristiques ----
  const characteristicsRows: { label: string; value: React.ReactNode }[] = [
    { label: "Type de produit", value: PRODUCT_TYPE_LABELS[product.type] ?? product.type },
    { label: "Référence (SKU)", value: product.sku ?? "—" },
    { label: "Marque", value: "Téranga Market" },
    { label: "Note moyenne", value: `${product.ratingAvg.toFixed(1)}/5 (${product.ratingCount} avis)` },
  ]
  if (product.barcode) characteristicsRows.push({ label: "Code-barres", value: product.barcode })
  if (isDigital || isHybrid) {
    characteristicsRows.push({
      label: "Contenu numérique",
      value: `Fichier téléchargeable (jusqu'à ${product.digitalDownloadLimit} téléchargements)`,
    })
  }

  const characteristicsTab = (
    <div className="max-w-3xl space-y-6">
      <dl className="divide-y rounded-xl border bg-card shadow-sm">
        {characteristicsRows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <dt className="text-sm font-semibold">{row.label}</dt>
            <dd className="text-sm text-muted-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>

      {attributes.filter((a) => a.name && Array.isArray(a.values)).length > 0 && (
        <div>
          <h3 className="mb-2 font-bold">Options et attributs</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {attributes
              .filter((a) => a.name && Array.isArray(a.values))
              .map((a, i) => (
                <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
                  <p className="text-sm font-semibold">{String(a.name)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(a.values as unknown[])
                      .filter((v): v is string => typeof v === "string")
                      .map((value) => (
                        <span key={value} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                          {value}
                        </span>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )

  // ---- Onglets : avis ----
  const reviewsTab = (
    <div id="avis" className="scroll-mt-24 space-y-6">
      {/* Résumé */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 shadow-sm">
        <div>
          <p className="text-3xl font-extrabold tabular-nums">{product.ratingAvg.toFixed(1)}</p>
          <RatingStars rating={product.ratingAvg} showCount={false} />
        </div>
        <div className="text-sm text-muted-foreground">
          {reviewsTotal > 0
            ? `Note moyenne sur ${reviewsTotal} avis${reviewsTotal > 1 ? "s" : ""} vérifié${reviewsTotal > 1 ? "s" : ""} par notre équipe`
            : "Aucun avis pour le moment"}
        </div>
      </div>

      {/* Liste */}
      {reviews.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-stone-50 p-6 text-center text-sm text-muted-foreground">
          {reviewsTotal === 0 && "Ce produit n'a pas encore d'avis. Les acheteurs vérifiés peuvent lancer la conversation !"}
        </p>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <article key={r.id} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RatingStars rating={r.rating} showCount={false} />
                  <span className="text-sm font-semibold">{r.authorName}</span>
                  {r.isVerifiedBuyer && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Achat vérifié
                    </span>
                  )}
                </div>
                <time className="text-xs text-muted-foreground" dateTime={new Date(r.createdAt).toISOString()}>
                  {new Date(r.createdAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </div>
              {r.title && <p className="mt-2 text-sm font-bold">{r.title}</p>}
              <p className="mt-1 text-sm leading-relaxed text-foreground/90">{r.comment}</p>
              {r.adminReply && (
                <div className="mt-3 rounded-lg bg-secondary/60 p-3 text-sm">
                  <span className="font-semibold">Réponse de Téranga Market : </span>
                  <span className="text-muted-foreground">{r.adminReply}</span>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Pagination légère des avis */}
      {reviewsPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {currentReviewPage > 1 ? (
            <Link
              href={`?rev=${currentReviewPage - 1}#avis`}
              className="rounded-lg border bg-card px-3 py-1.5 font-medium shadow-sm transition hover:bg-secondary"
            >
              ← Précédents
            </Link>
          ) : (
            <span className="rounded-lg border px-3 py-1.5 text-muted-foreground opacity-40">← Précédents</span>
          )}
          <span className="text-xs text-muted-foreground">
            Page {currentReviewPage} / {reviewsPages}
          </span>
          {currentReviewPage < reviewsPages ? (
            <Link
              href={`?rev=${currentReviewPage + 1}#avis`}
              className="rounded-lg border bg-card px-3 py-1.5 font-medium shadow-sm transition hover:bg-secondary"
            >
              Suivants →
            </Link>
          ) : (
            <span className="rounded-lg border px-3 py-1.5 text-muted-foreground opacity-40">Suivants →</span>
          )}
        </div>
      )}

      {/* Publier un avis — règles d'accès */}
      <div>
        <h3 className="mb-3 font-bold">Donner mon avis</h3>
        {!user && (
          <div className="rounded-xl border border-dashed bg-stone-50 p-5 text-sm">
            <p className="text-muted-foreground">
              Seuls les clients ayant acheté ce produit peuvent publier un avis. Connectez-vous pour vérifier
              votre éligibilité.
            </p>
            <Button asChild className="mt-3 bg-brand text-brand-foreground hover:brightness-95">
              <Link href={`/login?next=/products/${product.slug}`}>Se connecter pour publier un avis</Link>
            </Button>
          </div>
        )}
        {user && alreadyReviewed && (
          <p className="rounded-xl border bg-secondary/50 p-4 text-sm text-muted-foreground">
            Vous avez déjà publié un avis pour ce produit — merci pour votre retour !
          </p>
        )}
        {user && !alreadyReviewed && !canReview && (
          <p className="rounded-xl border border-dashed bg-stone-50 p-5 text-sm text-muted-foreground">
            Les avis sont réservés aux acheteurs vérifiés : vous devez avoir acheté ce produit avec une commande
            <strong> payée</strong> pour pouvoir le noter. Cette règle garantit des avis authentiques et fiables
            pour tous.
          </p>
        )}
        {user && canReview && !alreadyReviewed && <ReviewForm slug={product.slug} />}
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      {/* Fil d'Ariane */}
      <nav aria-label="Fil d'Ariane" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground hover:underline">Accueil</Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        {mainCategory ? (
          <>
            <Link href={`/categories/${mainCategory.slug}`} className="hover:text-foreground hover:underline">
              {mainCategory.name}
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden />
          </>
        ) : (
          <>
            <Link href="/catalogue" className="hover:text-foreground hover:underline">Catalogue</Link>
            <ChevronRight className="h-3 w-3" aria-hidden />
          </>
        )}
        <span aria-current="page" className="font-medium text-foreground">{product.name}</span>
      </nav>

      {/* Galerie + infos */}
      <div className="grid gap-8 lg:grid-cols-2">
        <Reveal>
          <ProductGallery images={images} name={product.name} badge={galleryBadges} />
        </Reveal>

        <div>
          <Reveal delay={0.05}>
            <div className="flex flex-wrap items-center gap-2">
              {product.isFeatured && (
                <Badge className="bg-primary text-primary-foreground shadow-sm">Coup de cœur</Badge>
                )}
              {onSale && <Badge className="bg-brand text-brand-foreground shadow-sm">Promotion</Badge>}
            </div>

            <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
              {product.name}
            </h1>

            {product.ratingCount > 0 && (
              <Link href={`?rev=1#avis`} className="mt-2 inline-flex items-center gap-1.5 hover:underline">
                <RatingStars rating={product.ratingAvg} count={product.ratingCount} />
              </Link>
            )}

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{product.shortDescription}</p>
          </Reveal>

          <Reveal delay={0.1} className="mt-5">
            <PurchasePanel
              productId={product.id}
              type={product.type}
              trackInventory={product.trackInventory}
              basePrice={product.price}
              baseSalePrice={product.salePrice}
              baseStock={product.stock}
              lowStockThreshold={settings.lowStockThreshold}
              optimistic={{
                name: product.name,
                slug: product.slug,
                image: parseJson<string[]>(product.imagesJson, [])[0] ?? null,
                type: product.type,
              }}
              variants={product.variants.map((v) => ({
                id: v.id,
                name: v.name,
                price: v.price,
                stock: v.stock,
              }))}
            />
          </Reveal>

          {/* Encarts livraison / numérique */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {product.requiresShipping && (
              <div className="flex gap-3 rounded-xl border bg-card p-4 shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-foreground">
                  <Truck className="h-5 w-5" strokeWidth={1.7} aria-hidden />
                </span>
                <div className="text-sm leading-snug">
                  <p className="font-semibold">Livraison offerte dès {formatXOF(settings.freeShippingThreshold)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    24–72 h à Abidjan, délais estimés selon votre zone.
                  </p>
                </div>
              </div>
            )}
            {(isDigital || isHybrid) && (
              <div className="flex gap-3 rounded-xl border bg-card p-4 shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-foreground">
                  <Download className="h-5 w-5" strokeWidth={1.7} aria-hidden />
                </span>
                <div className="text-sm leading-snug">
                  <p className="font-semibold">Téléchargement immédiat après confirmation du paiement</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Fichiers accessibles dans Mon compte → Téléchargements.
                  </p>
                </div>
              </div>
            )}
            <div className="flex gap-3 rounded-xl border bg-card p-4 shadow-sm">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-foreground">
                <ShieldCheck className="h-5 w-5" strokeWidth={1.7} aria-hidden />
              </span>
              <div className="text-sm leading-snug">
                <p className="font-semibold">Paiement à la livraison possible</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Payez en espèces à réception — zéro risque.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sections produit (Amazon-style : Description / Caractéristiques / Avis empilés) */}
      <div className="mt-10">
        <ProductTabs
          description={descriptionTab}
          characteristics={characteristicsTab}
          reviews={reviewsTab}
          reviewCount={reviewsTotal}
        />
      </div>

      {/* Produits similaires */}
      {related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-12">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 id="related-title" className="text-xl font-extrabold tracking-tight">
              Produits similaires
            </h2>
            <Link
              href={mainCategory ? `/categories/${mainCategory.slug}` : "/catalogue"}
              className="text-sm font-semibold text-brand-foreground hover:underline"
            >
              Voir la catégorie →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={toProductCardData(p)} />
            ))}
          </div>
        </section>
      )}

      {/* Vus récemment (localStorage) */}
      <RecentlyViewed
        current={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          price: product.price,
          salePrice: product.salePrice,
          images: images.slice(0, 1),
          type: product.type,
        }}
      />
    </div>
  )
}
