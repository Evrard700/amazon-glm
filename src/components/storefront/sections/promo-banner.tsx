// Section publique BANDEAU PROMOTIONNEL — server component (couleurs inline).
import Link from "next/link"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Container, str } from "./section-ui"
import { Reveal } from "./Reveal"

export function PromoBannerSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title)
  const text = str(props.text)
  const ctaLabel = str(props.ctaLabel)
  const ctaHref = str(props.ctaHref, "/catalogue") || "/catalogue"
  const background = str(props.background, "#18181b")
  const textColor = str(props.textColor, "#fafaf9")
  const image = str(props.image)

  if (!title && !text && !ctaLabel) return null

  return (
    <Container className="py-10">
      <Reveal>
        <div
          className="relative isolate overflow-hidden rounded-2xl shadow-lg"
          style={{ backgroundColor: background, color: textColor }}
        >
          {image && (
            <>
              <div className="absolute inset-y-0 right-0 hidden w-2/5 lg:block" aria-hidden>
                <Image src={image} alt="" fill sizes="(min-width: 1024px) 40vw, 0vw" className="object-cover" />
              </div>
              <div
                className="absolute inset-0 hidden lg:block"
                style={{ background: `linear-gradient(90deg, ${background} 35%, ${background}00 100%)` }}
                aria-hidden
              />
            </>
          )}
          <div className="relative max-w-2xl p-6 sm:p-10">
            {title && <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>}
            {text && <p className="mt-2 text-sm leading-relaxed opacity-85 sm:text-base">{text}</p>}
            {ctaLabel && (
              <Link
                href={ctaHref}
                className="mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold shadow-lg transition hover:brightness-110 active:scale-[0.98]"
                style={{ backgroundColor: textColor, color: background }}
              >
                {ctaLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </Reveal>
    </Container>
  )
}
