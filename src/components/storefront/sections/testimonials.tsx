// Section publique TÉMOIGNAGES — server component.
import { Quote } from "lucide-react"
import { RatingStars } from "@/components/storefront/rating-stars"
import { Container, num, recordList, str } from "./section-ui"
import { SectionHeading } from "./section-ui"
import { Reveal } from "./Reveal"

export function TestimonialsSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title, "Ils nous font confiance")
  const items = recordList(props.items)
  if (items.length === 0) return null

  return (
    <section className="bg-stone-50 py-12">
      <Container>
        <SectionHeading title={title} center />
        <Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it, i) => (
              <figure
                key={i}
                className="flex h-full flex-col rounded-xl border bg-card p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <Quote className="h-6 w-6 fill-brand text-brand" aria-hidden />
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-foreground/90">
                  « {str(it.text, "Témoignage")} »
                </blockquote>
                <figcaption className="mt-4 border-t pt-3">
                  <RatingStars rating={num(it.rating, 5, 1, 5)} showCount={false} />
                  <p className="mt-1.5 text-sm font-semibold">{str(it.name, "Client")}</p>
                  {str(it.city) && <p className="text-xs text-muted-foreground">{str(it.city)}</p>}
                </figcaption>
              </figure>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
