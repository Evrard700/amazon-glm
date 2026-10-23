import { cn } from "@/lib/utils"
import { formatXOF } from "@/lib/money"

/** Affichage prix avec mise en avant du prix promotionnel (jamais de $, FCFA). */
export function PriceTag({
  price,
  salePrice,
  size = "md",
  className,
}: {
  price: number
  salePrice?: number | null
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const onSale = salePrice != null && salePrice < price
  const final = onSale ? salePrice : price
  const sizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-2xl",
  }
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("font-bold tracking-tight", sizes[size])}>{formatXOF(final)}</span>
      {onSale && (
        <>
          <span className="text-sm text-muted-foreground line-through">{formatXOF(price)}</span>
          <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-semibold text-brand-foreground">
            -{Math.round(((price - (salePrice as number)) / price) * 100)} %
          </span>
        </>
      )}
    </div>
  )
}
