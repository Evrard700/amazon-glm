// Section publique FAQ — accordéon natif <details>/<summary> :
// interactif SANS JavaScript, rendu serveur complet (SEO + zéro divergence
// d'hydratation, contrairement à l'Accordion Radix basé sur useId).
import { ChevronDown } from "lucide-react"
import { Container, recordList, str } from "./section-ui"
import { SectionHeading } from "./section-ui"
import { Reveal } from "./Reveal"

export function FaqSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title, "Questions fréquentes")
  const items = recordList(props.items)
  if (items.length === 0) return null

  return (
    <section className="bg-stone-50 py-12">
      <Container>
        <SectionHeading title={title} center />
        <Reveal className="mx-auto max-w-3xl">
          <div className="rounded-xl border bg-card px-5 shadow-sm">
            {items.map((it, i) => (
              <details key={i} className="group border-b last:border-b-0" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-left text-sm font-semibold transition-colors hover:text-brand-foreground sm:text-base [&::-webkit-details-marker]:hidden">
                  {str(it.q, "Question")}
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="pb-4 text-sm leading-relaxed text-muted-foreground">{str(it.a, "")}</div>
              </details>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
