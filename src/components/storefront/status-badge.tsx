import { cn } from "@/lib/utils"
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  REWARD_STATUS_LABELS,
  orderStatusColor,
  paymentStatusColor,
} from "@/lib/constants"

/** Badge de statut de commande (libellés FR de @/lib/constants). */
export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        orderStatusColor(status),
        className,
      )}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  )
}

/** Badge de statut de paiement (séparé du statut de commande). */
export function PaymentStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        paymentStatusColor(status),
        className,
      )}
    >
      {PAYMENT_STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function rewardStatusColor(status: string): string {
  switch (status) {
    case "REWARD_PENDING":
      return "bg-amber-100 text-amber-800 border-amber-200"
    case "REWARD_APPROVED":
      return "bg-sky-100 text-sky-800 border-sky-200"
    case "REWARD_AVAILABLE":
      return "bg-emerald-100 text-emerald-800 border-emerald-200"
    case "REWARD_USED":
      return "bg-neutral-100 text-neutral-600 border-neutral-200"
    case "REWARD_PAID":
      return "bg-green-100 text-green-800 border-green-200"
    case "REWARD_CANCELLED":
      return "bg-rose-100 text-rose-700 border-rose-200"
    default:
      return "bg-neutral-100 text-neutral-600 border-neutral-200"
  }
}

/** Badge de statut de récompense parrainage. */
export function RewardStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        rewardStatusColor(status),
        className,
      )}
    >
      {REWARD_STATUS_LABELS[status] ?? status}
    </span>
  )
}
