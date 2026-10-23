import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  PRODUCT_TYPE_LABELS,
  REWARD_STATUS_LABELS,
  ROLE_LABELS,
  orderStatusColor,
  paymentStatusColor,
} from "@/lib/constants"

/** Badges de statut réutilisés dans toute l'admin — libellés depuis @/lib/constants. */

function colorBadge(label: string, color: string, className?: string) {
  return (
    <Badge variant="outline" className={cn("border font-medium whitespace-nowrap", color, className)}>
      {label}
    </Badge>
  )
}

export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  return colorBadge(ORDER_STATUS_LABELS[status] ?? status, orderStatusColor(status), className)
}

export function PaymentStatusBadge({ status, className }: { status: string; className?: string }) {
  return colorBadge(PAYMENT_STATUS_LABELS[status] ?? status, paymentStatusColor(status), className)
}

export function ProductStatusBadge({ status, className }: { status: string; className?: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-neutral-100 text-neutral-600 border-neutral-200",
    ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
    ARCHIVED: "bg-orange-100 text-orange-700 border-orange-200",
  }
  return colorBadge(PRODUCT_STATUS_LABELS[status] ?? status, colors[status] ?? "bg-neutral-100 text-neutral-600 border-neutral-200", className)
}

export function ProductTypeBadge({ type, className }: { type: string; className?: string }) {
  const short: Record<string, string> = { PHYSICAL: "Physique", DIGITAL: "Numérique", HYBRID: "Hybride" }
  const colors: Record<string, string> = {
    PHYSICAL: "bg-stone-100 text-stone-700 border-stone-200",
    DIGITAL: "bg-violet-100 text-violet-700 border-violet-200",
    HYBRID: "bg-teal-100 text-teal-700 border-teal-200",
  }
  return (
    <Badge variant="outline" title={PRODUCT_TYPE_LABELS[type] ?? type} className={cn("border font-medium whitespace-nowrap", colors[type] ?? "", className)}>
      {short[type] ?? type}
    </Badge>
  )
}

export function RewardStatusBadge({ status, className }: { status: string; className?: string }) {
  const colors: Record<string, string> = {
    REWARD_PENDING: "bg-amber-100 text-amber-800 border-amber-200",
    REWARD_APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
    REWARD_AVAILABLE: "bg-green-100 text-green-800 border-green-200",
    REWARD_USED: "bg-neutral-100 text-neutral-600 border-neutral-200",
    REWARD_PAID: "bg-sky-100 text-sky-800 border-sky-200",
    REWARD_CANCELLED: "bg-rose-100 text-rose-700 border-rose-200",
  }
  return colorBadge(REWARD_STATUS_LABELS[status] ?? status, colors[status] ?? "bg-neutral-100 text-neutral-600 border-neutral-200", className)
}

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const colors: Record<string, string> = {
    OWNER: "bg-brand-soft text-brand-foreground border-amber-200",
    ADMIN: "bg-rose-100 text-rose-700 border-rose-200",
    MANAGER: "bg-emerald-100 text-emerald-800 border-emerald-200",
    MARKETING: "bg-orange-100 text-orange-700 border-orange-200",
    STAFF: "bg-neutral-100 text-neutral-600 border-neutral-200",
    CUSTOMER: "bg-stone-100 text-stone-600 border-stone-200",
  }
  return colorBadge(ROLE_LABELS[role] ?? role, colors[role] ?? "bg-neutral-100 text-neutral-600 border-neutral-200", className)
}

export function RefundStatusBadge({ status, className }: { status: string; className?: string }) {
  const labels: Record<string, string> = { PENDING: "À effectuer", PROCESSED: "Effectué", CANCELLED: "Annulé" }
  const colors: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800 border-amber-200",
    PROCESSED: "bg-emerald-100 text-emerald-800 border-emerald-200",
    CANCELLED: "bg-neutral-100 text-neutral-600 border-neutral-200",
  }
  return colorBadge(labels[status] ?? status, colors[status] ?? "bg-neutral-100 text-neutral-600 border-neutral-200", className)
}

export function StockBadge({ stock, threshold, trackInventory = true }: { stock: number; threshold: number; trackInventory?: boolean }) {
  if (!trackInventory) {
    return <Badge variant="outline" className="border bg-neutral-100 text-neutral-600 border-neutral-200">Non suivi</Badge>
  }
  if (stock <= 0) {
    return <Badge variant="outline" className="border bg-rose-100 text-rose-700 border-rose-200">Rupture</Badge>
  }
  if (stock <= threshold) {
    return <Badge variant="outline" className="border bg-amber-100 text-amber-800 border-amber-200">Faible ({stock})</Badge>
  }
  return <Badge variant="outline" className="border bg-emerald-100 text-emerald-800 border-emerald-200">OK ({stock})</Badge>
}
