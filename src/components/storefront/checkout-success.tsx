"use client"

import { Check } from "lucide-react"
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/storefront/status-badge"
import { formatXOF } from "@/lib/money"

/** En-tête animé de la page de remerciement (succès de commande). */
export function OrderSuccessHero({
  customerName,
  orderNumber,
  orderStatus,
  paymentStatus,
  total,
  paymentMethodLabel,
}: {
  customerName: string
  orderNumber: string
  orderStatus: string
  paymentStatus: string
  total: number
  paymentMethodLabel: string | null
}) {
  return (
    // CSS pur : fondu + montée au montage (keyframe slide-up de globals.css),
    // calque l'ancien motion.header (opacity 0, y 12 → 0.35 s).
    <header
      className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-card p-6 text-center shadow-sm animate-[slide-up_0.35s_ease-out] sm:p-8 dark:border-emerald-900 dark:from-emerald-950/50"
    >
      {/* Coche : pop avec léger rebond (cubic-bezier overshoot) + délai 0.1 s,
          calque l'ancien ressort framer (scale 0 / rotation -20° → 1). */}
      <span
        className="mx-auto flex h-16 w-16 animate-[pop-in_0.45s_cubic-bezier(0.34,1.56,0.64,1)_0.1s_both] items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg"
        aria-hidden
      >
        <Check className="h-9 w-9" strokeWidth={3} />
      </span>
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
        Merci {customerName.split(" ")[0]} ! Votre commande est enregistrée.
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Un récapitulatif vient d&apos;être envoyé à votre adresse email en cas de doute, gardez votre numéro à portée de main.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-lg bg-primary px-3 py-1.5 font-mono text-sm font-bold tracking-wider text-primary-foreground">
          {orderNumber}
        </span>
        <OrderStatusBadge status={orderStatus} />
        <PaymentStatusBadge status={paymentStatus} />
      </div>
      <p className="mt-4 text-2xl font-extrabold text-brand-foreground">{formatXOF(total)}</p>
      {paymentMethodLabel && (
        <p className="text-xs text-muted-foreground">à régler via « {paymentMethodLabel} »</p>
      )}
    </header>
  )
}
