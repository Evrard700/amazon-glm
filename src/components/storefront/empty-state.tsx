import { PackageSearch } from "lucide-react"
import { cn } from "@/lib/utils"

export function EmptyState({
  icon: Icon = PackageSearch,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-14 text-center", className)}>
      <div className="rounded-full bg-brand-soft p-4 text-brand-foreground">
        <Icon className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
