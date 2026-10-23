// Section publique AVIS CLIENTS RÉCENTS — data-driven (avis APPROVED).
// Derniers avis via le cache mémoire (src/lib/catalog-data, 12 max demandables).
import Link from "next/link"
import Image from "next/image"
import { BadgeCheck, Package } from "lucide-react"
import { getLatestReviews } from "@/lib/catalog-data"
import { RatingStars } from "@/components/storefront/rating-stars"
import { Container, num, str } from "./section-ui"
import { SectionHeading } from "./section-ui"
import { Reveal } from "./Reveal"

export async function ReviewsSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title, "Ce que disent nos clients")
  const count = num(props.count, 6, 1, 12)

  const reviews = (await getLatestReviews()).slice(0, count)
  if (reviews.length === 0) return null

  return (
    <section className="bg-stone-50 py-12">
      <Container>
        <SectionHeading title={title} center />
        <Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r) => {
              const image = (() => {
                try {
                  const imgs = JSON.parse(r.product.imagesJson || "[]")
                  return Array.isArray(imgs) && imgs.length > 0 ? (imgs[0] as string) : null
                } catch {
                  return null
                }
              })()
              return (
                <figure
                  key={r.id}
                  className="flex h-full flex-col rounded-xl border bg-card p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-secondary/60">
                      {image ? (
                        <Image src={image} alt={r.product.name} fill sizes="48px" className="object-cover" />
                      ) : (
                        <span className="grid h-full place-items-center text-muted-foreground">
                          <Package className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                        </span>
                      )}
                    </span>
                    <div className="min-w-0">
                      <RatingStars rating={r.rating} showCount={false} />
                      <Link
                        href={`/products/${r.product.slug}`}
                        className="block truncate text-sm font-semibold hover:text-brand-foreground hover:underline"
                      >
                        {r.product.name}
                      </Link>
                    </div>
                  </div>
                  <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-foreground/90">
                    « {r.comment} »
                  </blockquote>
                  <figcaption className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                    <span className="text-sm font-semibold">{r.authorName}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                    {r.isVerifiedBuyer && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Achat vérifié
                      </span>
                    )}
                  </figcaption>
                </figure>
              )
            })}
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
