"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface MultiSelectOption {
  value: string
  label: string
  hint?: string
}

/**
 * Multi-select générique (catégories, collections, produits…)
 * Liste scrollable (max-h + scrollbar-thin), recherche intégrée, tout (dé)sélectionner.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Sélectionner…",
  emptyMessage = "Aucune option disponible.",
  maxVisible = 3,
  className,
  disabled,
}: {
  options: MultiSelectOption[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  emptyMessage?: string
  maxVisible?: number
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  const labels = useMemo(() => {
    const map = new Map(options.map((o) => [o.value, o.label]))
    return value.map((v) => map.get(v) ?? v)
  }, [options, value])

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-auto min-h-9 w-full justify-between px-3 py-1.5 font-normal", className)}
        >
          <div className="flex flex-wrap items-center gap-1 overflow-hidden text-left">
            {labels.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              <>
                {labels.slice(0, maxVisible).map((label) => (
                  <Badge key={label} variant="secondary" className="max-w-40 truncate">
                    {label}
                  </Badge>
                ))}
                {labels.length > maxVisible && (
                  <span className="text-xs text-muted-foreground">+{labels.length - maxVisible}</span>
                )}
              </>
            )}
          </div>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {options.length > 0 && (
            <button
              type="button"
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onChange(filtered.length === options.length ? [] : filtered.map((o) => o.value))}
            >
              {value.length > 0 && value.length >= filtered.length ? "Vider" : "Tout"}
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto scrollbar-thin p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            filtered.map((o) => {
              const checked = value.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
