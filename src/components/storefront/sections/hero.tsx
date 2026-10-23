// Section publique HERO — server component.
import Link from "next/link"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Container, str, num } from "./section-ui"
import { Reveal } from "./Reveal"

export function HeroSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title, "Le meilleur du shopping, livré chez vous.")
  const subtitle = str(props.subtitle)
  const ctaLabel = str(props.ctaLabel)
  const ctaHref = str(props.ctaHref, "/catalogue") || "/catalogue"
  const cta2Label = str(props.ctaLabel2)
  const cta2Href = str(props.ctaHref2) || "/catalogue"
  const image = str(props.image)
  const center = str(props.align, "left") === "center"
  const overlay = num(props.overlay, 55, 0, 90)

  return (
    <section className="relative isolate overflow-hidden bg-primary">
      {image ? (
        <>
          <Image
            src={image}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-primary" style={{ opacity: overlay / 100 }} aria-hidden />
        </>
      ) : (
        <div className="absolute inset-0" aria-hidden>
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand/25 blur-3xl" />
          <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        </div>
      )}
      <Container
        className={cn("relative py-16 text-primary-foreground sm:py-24 lg:py-28", center && "text-center")}
      >
        <div className={cn("max-w-2xl", center && "mx-auto")}>
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Téranga Market</p>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              {title}
            </h1>
          </Reveal>
          {subtitle && (
            <Reveal delay={0.08}>
              <p className="mt-4 text-base leading-relaxed text-primary-foreground/85 sm:text-lg">{subtitle}</p>
            </Reveal>
          )}
          <Reveal delay={0.16}>
            <div className={cn("mt-8 flex flex-wrap items-center gap-3", center && "justify-center")}>
              {ctaLabel && (
                <Link
                  href={ctaHref}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-bold text-brand-foreground shadow-lg transition hover:brightness-95 active:scale-[0.98]"
                >
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
              {cta2Label && (
                <Link
                  href={cta2Href}
                  className="inline-flex items-center rounded-lg border border-primary-foreground/30 bg-primary-foreground/5 px-5 py-3 text-sm font-semibold text-primary-foreground backdrop-blur transition hover:bg-primary-foreground/15"
                >
                  {cta2Label}
                </Link>
              )}
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}
