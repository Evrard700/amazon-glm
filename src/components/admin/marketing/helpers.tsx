"use client"

import { useState } from "react"
import { Check, Copy, PackageSearch, Users2, Layers, Globe2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatXOF } from "@/lib/money"
import {
  COUPON_TYPE_LABELS,
  REWARD_STATUS_LABELS,
} from "@/lib/constants"

/**
 * Briques UI partagées par les modules marketing admin (Task 3-b).
 * Palette : emerald = OK / actif, amber = en attente, rose = annulé/refusé,
 * neutral = brouillon. Aucune teinte bleue/indigo.
 */

// ---------- Badges ----------

const BADGE_TONES = {
  ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  danger: "bg-rose-100 text-rose-700 border-rose-200",
  neutral: "bg-neutral-100 text-neutral-600 border-neutral-200",
  brand: "bg-amber-100 text-amber-900 border-amber-300",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
} as const

export type BadgeTone = keyof typeof BADGE_TONES

export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: BadgeTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", BADGE_TONES[tone], className)}>
      {children}
    </Badge>
  )
}

/** Statut de récompense (labels FR officiels de @/lib/constants). */
export function RewardStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "REWARD_PENDING":
      return <ToneBadge tone="pending">{REWARD_STATUS_LABELS.REWARD_PENDING}</ToneBadge>
    case "REWARD_APPROVED":
      return <ToneBadge tone="brand">{REWARD_STATUS_LABELS.REWARD_APPROVED}</ToneBadge>
    case "REWARD_AVAILABLE":
      return <ToneBadge tone="ok">{REWARD_STATUS_LABELS.REWARD_AVAILABLE}</ToneBadge>
    case "REWARD_USED":
      return <ToneBadge tone="ok">{REWARD_STATUS_LABELS.REWARD_USED}</ToneBadge>
    case "REWARD_PAID":
      return <ToneBadge tone="ok">{REWARD_STATUS_LABELS.REWARD_PAID}</ToneBadge>
    case "REWARD_CANCELLED":
      return <ToneBadge tone="danger">{REWARD_STATUS_LABELS.REWARD_CANCELLED}</ToneBadge>
    default:
      return <ToneBadge tone="neutral">{status}</ToneBadge>
  }
}

export function ActiveBadge({ isActive, activeLabel = "Actif", inactiveLabel = "Désactivé" }: { isActive: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return (
    <ToneBadge tone={isActive ? "ok" : "neutral"}>
      <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle", isActive ? "bg-emerald-500" : "bg-neutral-400")} />
      {isActive ? activeLabel : inactiveLabel}
    </ToneBadge>
  )
}

export function CouponTypeBadge({ type, value }: { type: string; value?: number }) {
  switch (type) {
    case "PERCENT":
      return <ToneBadge tone="brand">{COUPON_TYPE_LABELS.PERCENT}{typeof value === "number" ? ` · ${value} %` : ""}</ToneBadge>
    case "FIXED":
      return <ToneBadge tone="brand">{COUPON_TYPE_LABELS.FIXED}</ToneBadge>
    case "FREE_SHIPPING":
      return <ToneBadge tone="ok">{COUPON_TYPE_LABELS.FREE_SHIPPING}</ToneBadge>
    case "FREE_PRODUCT":
      return <ToneBadge tone="ok">{COUPON_TYPE_LABELS.FREE_PRODUCT}</ToneBadge>
    default:
      return <ToneBadge tone="neutral">{type}</ToneBadge>
  }
}

/** Libellé humain de la valeur d'un coupon selon son type. */
export function couponValueLabel(type: string, value: number): string {
  switch (type) {
    case "PERCENT":
      return `−${value} %`
    case "FIXED":
      return `−${formatXOF(value)}`
    case "FREE_SHIPPING":
      return "Livraison 0 FCFA"
    case "FREE_PRODUCT":
      return "Produit offert"
    default:
      return ""
  }
}

/** Badge de périmètre (cible) : tous / produits / catégories / client précis. */
export function ScopeBadge({
  appliesTo,
  count,
  targetUser,
}: {
  appliesTo: string
  count?: number
  targetUser?: string | null
}) {
  if (targetUser) {
    return (
      <ToneBadge tone="orange">
        <Users2 className="mr-1 h-3 w-3" /> Réservé : {targetUser}
      </ToneBadge>
    )
  }
  if (appliesTo === "ALL") {
    return (
      <ToneBadge tone="neutral">
        <Globe2 className="mr-1 h-3 w-3" /> Tout le catalogue
      </ToneBadge>
    )
  }
  if (appliesTo === "PRODUCTS") {
    return (
      <ToneBadge tone="neutral">
        <PackageSearch className="mr-1 h-3 w-3" />
        {typeof count === "number" ? `${count} produit${count > 1 ? "s" : ""}` : "Produits"}
      </ToneBadge>
    )
  }
  return (
    <ToneBadge tone="neutral">
      <Layers className="mr-1 h-3 w-3" />
      {typeof count === "number" ? `${count} catégorie${count > 1 ? "s" : ""}` : "Catégories"}
    </ToneBadge>
  )
}

// ---------- Champs de formulaire avec explication pédagogique ----------

export function FieldHint({ text }: { text: string }) {
  return <p className="mt-1 text-xs leading-snug text-muted-foreground">{text}</p>
}

export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-sm font-medium leading-none">
      {children}
      {required && <span className="ml-0.5 text-rose-600">*</span>}
    </label>
  )
}

// ---------- Dates ----------

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

export function formatDateFR(date: string | Date | null | undefined): string {
  if (!date) return "—"
  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return "—"
  return dateFmt.format(d)
}

export function formatDateTimeFR(date: string | Date | null | undefined): string {
  if (!date) return "—"
  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return "—"
  return dateTimeFmt.format(d)
}

/** « il y a 3 h », « il y a 2 j »… pour les paniers abandonnés. */
export function timeAgoFR(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date
  const diffMs = Date.now() - d.getTime()
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) return "il y a moins d'1 h"
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days} j`
  const months = Math.floor(days / 30)
  return `il y a ${months} mois`
}

/** Conversion Date → valeur input datetime-local. */
export function toLocalInputValue(date: string | Date | null | undefined): string {
  if (!date) return ""
  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---------- Divers ----------

/** Code monospace copiable en un clic. */
export function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title="Copier le code"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(code).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="group inline-flex items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-neutral-800 transition hover:bg-neutral-200"
    >
      {code}
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3 opacity-50 transition group-hover:opacity-100" />
      )}
    </button>
  )
}

/** État vide soigné pour les sections marketing. */
export function MarketingEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-secondary/30 px-6 py-10 text-center">
      <span className="rounded-full bg-brand-soft p-2.5 text-brand-foreground">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Étoiles de notation (affichage compact). */
export function StarsRating({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)} aria-label={`${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          className={cn("h-3.5 w-3.5", i <= Math.round(rating) ? "fill-amber-500" : "fill-neutral-200")}
          aria-hidden
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  )
}

/** Petit bouton d'action avec confirmation inline (utilisé dans les tables). */
export function TableActionButton({
  label,
  onClick,
  variant = "outline",
  tone,
  disabled,
  title,
}: {
  label: string
  onClick: () => void
  variant?: "outline" | "ghost" | "destructive" | "default"
  tone?: "ok" | "danger" | "pending" | "brand"
  disabled?: boolean
  title?: string
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
      : tone === "danger"
        ? "text-rose-700 hover:bg-rose-50 hover:text-rose-800"
        : tone === "pending"
          ? "text-amber-700 hover:bg-amber-50 hover:text-amber-800"
          : tone === "brand"
            ? "text-amber-700 hover:bg-amber-50 hover:text-amber-800"
            : ""
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={cn("h-7 px-2.5 text-xs", toneClass)}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      disabled={disabled}
      title={title}
    >
      {label}
    </Button>
  )
}
