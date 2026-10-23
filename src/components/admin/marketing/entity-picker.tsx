"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, ListFilter, Minus, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatXOF } from "@/lib/money"

/**
 * Sélecteurs d'entités pour les formulaires marketing :
 * listes légères (produits / catégories / clients) chargées via les API
 * /api/admin/marketing/{products|categories|clients}.
 */

export interface LightProduct {
  id: string
  name: string
  slug: string
  type: string
  status: string
  price: number
  salePrice: number | null
  unitPrice: number
  stock: number
  image: string | null
  categoryName: string | null
}

export interface LightCategory {
  id: string
  name: string
  slug: string
  productCount: number
}

export interface LightClient {
  id: string
  name: string
  email: string
  storeCredit: number
}

// ---------- Multi-sélection (produits / catégories) ----------

function MultiEntityPickerInner<T extends { id: string }>({
  items,
  selected,
  onChange,
  labelOf,
  metaOf,
  searchOf,
  triggerLabel,
  emptyLabel,
  maxSelection,
}: {
  items: T[]
  selected: string[]
  onChange: (ids: string[]) => void
  labelOf: (item: T) => string
  metaOf?: (item: T) => string | null
  searchOf?: (item: T) => string
  triggerLabel: string
  emptyLabel: string
  maxSelection?: number
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.trim().toLowerCase()
    return items.filter((i) => (searchOf ? searchOf(i) : labelOf(i)).toLowerCase().includes(q))
  }, [items, query, searchOf, labelOf])

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      if (maxSelection && selected.length >= maxSelection) return
      onChange([...selected, id])
    }
  }

  const selectedLabel =
    selected.length === 0 ? (
      triggerLabel
    ) : (
      <>
        {selected.length} sélectionné{selected.length > 1 ? "s" : ""}
        <span className="ml-1 font-normal text-muted-foreground">
          ({labelOf(items.find((i) => i.id === selected[0]) ?? items[0])}
          {selected.length > 1 ? "…" : ""})
        </span>
      </>
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between font-normal",
            selected.length > 0 && "border-amber-300 bg-amber-50/50",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate text-sm">
            <ListFilter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {selectedLabel}
          </span>
          <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(26rem,90vw)] p-0" align="start">
        <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer…"
            className="h-7 border-none px-0 text-sm shadow-none focus-visible:ring-0"
          />
          {selected.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onChange([])}
            >
              Vider
            </Button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>
          ) : (
            filtered.map((item) => {
              const isSelected = selected.includes(item.id)
              const meta = metaOf?.(item) ?? null
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition",
                    isSelected ? "bg-amber-50" : "hover:bg-secondary",
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggle(item.id)}
                    className="mt-0.5 pointer-events-none"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate leading-tight">{labelOf(item)}</span>
                    {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
                  </span>
                  {isSelected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ProductMultiPicker({
  products,
  selected,
  onChange,
  maxSelection,
}: {
  products: LightProduct[]
  selected: string[]
  onChange: (ids: string[]) => void
  maxSelection?: number
}) {
  return (
    <MultiEntityPickerInner
      items={products.filter((p) => p.status === "ACTIVE")}
      selected={selected}
      onChange={onChange}
      labelOf={(p) => p.name}
      metaOf={(p) => `${formatXOF(p.unitPrice)} · ${p.categoryName ?? "sans catégorie"}${p.type !== "PHYSICAL" ? " · numérique" : ""}`}
      searchOf={(p) => `${p.name} ${p.categoryName ?? ""}`}
      triggerLabel="Sélectionner des produits…"
      emptyLabel="Aucun produit publié ne correspond."
      maxSelection={maxSelection}
    />
  )
}

export function CategoryMultiPicker({
  categories,
  selected,
  onChange,
}: {
  categories: LightCategory[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <MultiEntityPickerInner
      items={categories}
      selected={selected}
      onChange={onChange}
      labelOf={(c) => c.name}
      metaOf={(c) => `${c.productCount} produit${c.productCount > 1 ? "s" : ""}`}
      triggerLabel="Sélectionner des catégories…"
      emptyLabel="Aucune catégorie ne correspond."
    />
  )
}

// ---------- Sélection simple ----------

export function ProductSingleSelect({
  products,
  value,
  onChange,
  placeholder = "Choisir un produit…",
  allowEmpty,
}: {
  products: LightProduct[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder?: string
  allowEmpty?: boolean
}) {
  return (
    <Select value={value ?? undefined} onValueChange={(v) => onChange(v || null)}>
      <SelectTrigger className="h-9 w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {allowEmpty && (
          <SelectItem value="none" className="text-muted-foreground">
            — Aucun —
          </SelectItem>
        )}
        {products
          .filter((p) => p.status === "ACTIVE")
          .map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-baseline gap-2">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatXOF(p.unitPrice)}</span>
              </span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
}

export function ClientSingleSelect({
  clients,
  value,
  onChange,
}: {
  clients: LightClient[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  return (
    <Select
      value={value === null ? "all" : value}
      onValueChange={(v) => onChange(v === "all" ? null : v)}
    >
      <SelectTrigger className="h-9 w-full">
        <SelectValue placeholder="Tous les clients" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="all">Tous les clients (code public)</SelectItem>
        {clients.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="flex flex-col items-start">
              <span className="truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.email}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Sélecteur de quantité compact (simulateur). */
export function QtyStepper({ value, onChange, min = 1, max = 99 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border">
      <button
        type="button"
        aria-label="Diminuer"
        className="flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-secondary disabled:opacity-40"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Augmenter"
        className="flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:bg-secondary disabled:opacity-40"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
