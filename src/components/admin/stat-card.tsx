import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { formatXOF } from "@/lib/money"

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  isCurrency = false,
  loading,
  className,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>
  trend?: { value: number; label?: string }
  isCurrency?: boolean
  loading?: boolean
  className?: string
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && (
          <span className="rounded-lg bg-brand-soft p-1.5 text-brand-foreground">
            <Icon className="h-4 w-4" strokeWidth={1.8} />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p className="mt-1.5 text-2xl font-extrabold tracking-tight">
          {isCurrency ? formatXOF(Number(value)) : typeof value === "number" ? new Intl.NumberFormat("fr-FR").format(value) : value}
        </p>
      )}
      {(hint || trend) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {trend && (
            <span className={cn("font-semibold", trend.value >= 0 ? "text-emerald-600" : "text-rose-600")}>
              {trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value)}%{" "}
            </span>
          )}
          {hint}
        </p>
      )}
    </div>
  )
}
