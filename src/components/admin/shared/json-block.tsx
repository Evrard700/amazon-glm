"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

/** Bloc JSON repliable et formaté (détails du journal d'activité). */
export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  const [open, setOpen] = useState(false)
  const isEmpty = value === null || value === undefined || (typeof value === "object" && Object.keys(value as object).length === 0)
  if (isEmpty) return <span className="text-xs text-muted-foreground">—</span>
  const text = JSON.stringify(value, null, 2)
  return (
    <div className={cn("rounded-lg border bg-secondary/40", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Détails JSON
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto scrollbar-thin border-t px-2.5 py-2 text-[11px] leading-relaxed">
          {text}
        </pre>
      )}
    </div>
  )
}
