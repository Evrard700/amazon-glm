"use client"

// Section publique COMPTE À REBOURS — client (setInterval), respecte prefers-reduced-motion.
import { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Container, str } from "./section-ui"

type Remaining = { days: number; hours: number; minutes: number; seconds: number; over: boolean }

function computeRemaining(endsAt: Date): Remaining {
  const diff = endsAt.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, over: true }
  const totalSeconds = Math.floor(diff / 1000)
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    over: false,
  }
}

const pad = (n: number) => String(n).padStart(2, "0")

/* Remplacement CSS pur de useReducedMotion (framer-motion) : lecture de la media
   query via useSyncExternalStore — aucun setState synchrone dans un effet, valeur
   serveur stable (false) donc aucun écart d'hydratation, puis synchronisation
   automatique côté client dès que la préférence change. */
const reducedMotionMq =
  typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null

function subscribeReducedMotion(onChange: () => void) {
  reducedMotionMq?.addEventListener("change", onChange)
  return () => reducedMotionMq?.removeEventListener("change", onChange)
}

const readReducedMotion = () => reducedMotionMq?.matches ?? false
const serverReducedMotion = () => false

export function CountdownSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title)
  const text = str(props.text)
  const endsAtRaw = str(props.endsAt)
  const ctaLabel = str(props.ctaLabel, "J'en profite")
  const ctaHref = str(props.ctaHref, "/catalogue?filter=promo") || "/catalogue?filter=promo"
  const reduce = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion)

  // Valeur initiale dérivée des props (identique au rendu serveur) ; l'intervalle
  // synchronise ensuite chaque seconde — pas de setState synchrone dans l'effet.
  const target = endsAtRaw ? new Date(endsAtRaw) : null
  const valid = target !== null && !Number.isNaN(target.getTime())
  const [remaining, setRemaining] = useState<Remaining>(() =>
    valid && target ? computeRemaining(target) : { days: 0, hours: 0, minutes: 0, seconds: 0, over: true },
  )

  useEffect(() => {
    if (!endsAtRaw) return
    const target = new Date(endsAtRaw)
    if (Number.isNaN(target.getTime())) return
    const timer = setInterval(() => setRemaining(computeRemaining(target)), 1000)
    return () => clearInterval(timer)
  }, [endsAtRaw])

  if (!valid) return null

  const boxes: { value: string; label: string }[] = [
    { value: pad(remaining.days), label: "Jours" },
    { value: pad(remaining.hours), label: "Heures" },
    { value: pad(remaining.minutes), label: "Min" },
    { value: pad(remaining.seconds), label: "Sec" },
  ]

  return (
    <section className="py-10">
      <Container>
        <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-10 text-center text-primary-foreground shadow-lg sm:px-12">
          <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-brand/20 blur-3xl" aria-hidden />
          <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-brand/15 blur-3xl" aria-hidden />
          <div className="relative">
            {title && <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>}
            {text && <p className="mx-auto mt-2 max-w-xl text-sm text-primary-foreground/80 sm:text-base">{text}</p>}

            {remaining.over ? (
              <p className="mt-6 inline-block rounded-lg border border-primary-foreground/25 px-5 py-3 text-sm font-semibold">
                Cette offre est terminée — revenez bientôt !
              </p>
            ) : (
              <div
                className="mt-6 flex justify-center gap-2 sm:gap-3"
                suppressHydrationWarning
                aria-label="Temps restant"
              >
                {boxes.map((b) => (
                  <div
                    key={b.label}
                    className={
                      "w-16 rounded-xl border border-primary-foreground/15 bg-primary-foreground/10 py-2.5 sm:w-20 " +
                      (reduce ? "" : "transition-transform duration-300")
                    }
                  >
                    <p className="text-xl font-extrabold tabular-nums sm:text-2xl" suppressHydrationWarning>
                      {b.value}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/60">
                      {b.label}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {!remaining.over && ctaLabel && (
              <Link
                href={ctaHref}
                className="mt-7 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-bold text-brand-foreground shadow-lg transition hover:brightness-95 active:scale-[0.98]"
              >
                {ctaLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </Container>
    </section>
  )
}
