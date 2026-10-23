// Helpers partagés par les composants de section publique (server components).
// Aucune dépendance serveur — utilisable aussi depuis les previews (client).
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Reveal } from "./Reveal"

// ---------- Lecteurs sûrs de props (JSON non typé) ----------

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

export function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
  const value = Number.isFinite(n) ? n : fallback
  return Math.min(Math.max(value, min), max)
}

export function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1"
}

export function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
}

export function recordList(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    : []
}

// ---------- Briques de mise en page ----------

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6", className)}>{children}</div>
}

export function SectionHeading({
  title,
  eyebrow,
  action,
  center,
}: {
  title: string
  eyebrow?: string
  action?: ReactNode
  center?: boolean
}) {
  if (!title) return null
  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-end justify-between gap-3",
        center && "flex-col items-center text-center",
      )}
    >
      <Reveal>
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-foreground">{eyebrow}</p>
        )}
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>
      </Reveal>
      {action && (
        <Reveal delay={0.06} className={center ? "w-full flex justify-center" : undefined}>
          {action}
        </Reveal>
      )}
    </div>
  )
}

/** Lien « Tout voir » réutilisable dans les en-têtes de section. */
export function SeeAllLink({ href, label = "Tout voir" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-sm font-semibold text-brand-foreground hover:underline"
    >
      {label} <span aria-hidden>→</span>
    </a>
  )
}
