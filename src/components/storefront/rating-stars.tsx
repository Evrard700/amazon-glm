import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

export function RatingStars({
  rating,
  count,
  size = 14,
  showCount = true,
  className,
}: {
  rating: number
  count?: number
  size?: number
  showCount?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-1", className)} aria-label={`Note : ${rating} sur 5`}>
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={size}
            className={cn(
              rating >= i - 0.25
                ? "fill-brand stroke-brand"
                : rating >= i - 0.75
                  ? "fill-brand/50 stroke-brand"
                  : "fill-none stroke-muted-foreground/40",
            )}
          />
        ))}
      </div>
      {showCount && count !== undefined && (
        <span className="text-xs text-muted-foreground">({count})</span>
      )}
    </div>
  )
}
