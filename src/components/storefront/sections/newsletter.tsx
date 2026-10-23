// Section publique NEWSLETTER — server + formulaire client (POST /api/newsletter).
import { Mail } from "lucide-react"
import { Container, str } from "./section-ui"
import { SectionHeading } from "./section-ui"
import { Reveal } from "./Reveal"
import { NewsletterForm } from "./newsletter-form"

export function NewsletterSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title, "Recevez nos offres en avant-première")
  const text = str(props.text)
  const ctaLabel = str(props.ctaLabel, "S'inscrire")

  return (
    <section className="bg-stone-50 py-12">
      <Container>
        <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-10 text-center text-primary-foreground shadow-lg sm:px-12 sm:py-12">
          <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-brand/20 blur-3xl" aria-hidden />
          <div className="relative">
            <Reveal>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand text-brand-foreground shadow-lg">
                <Mail className="h-6 w-6" aria-hidden />
              </span>
              <SectionHeading title={title} center />
              {text && (
                <p className="mx-auto mt-2 max-w-lg text-sm text-primary-foreground/80 sm:text-base">{text}</p>
              )}
            </Reveal>
            <NewsletterForm ctaLabel={ctaLabel} />
            <p className="mt-3 text-xs text-primary-foreground/50">
              Pas de spam — désinscription possible à tout moment.
            </p>
          </div>
        </div>
      </Container>
    </section>
  )
}
