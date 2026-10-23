"use client"

// Contrôles interactifs du catalogue — client components :
// SortSelect (tri — <select> natif : interactif dès le HTML servi, zéro
//   divergence d'hydratation contrairement au Select Radix basé sur useId),
// PriceForm (fourchette prix), MobileFilters (Sheet derrière barrière ClientOnly).
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Loader2, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ClientOnly } from "@/components/storefront/client-only"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  buildCatalogueUrl,
  SORT_OPTIONS,
  type CatalogueParams,
} from "./catalogue-params"

/** Sélecteur de tri — pousse les searchParams (pagination réinitialisée). */
export function SortSelect({
  basePath,
  params,
  value,
}: {
  basePath: string
  params: CatalogueParams
  value: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="catalogue-sort" className="hidden text-xs font-medium text-muted-foreground sm:block">
        Trier par
      </label>
      <div className="relative">
        {pending && (
          <Loader2 className="pointer-events-none absolute right-9 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
        )}
        {/* <select> natif : accessible, fonctionnel avant même l'hydratation,
            et sans id générés par useId (source d'erreurs d'hydratation). */}
        <select
          id="catalogue-sort"
          value={value}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value
            if (v === value) return
            startTransition(() => {
              router.push(buildCatalogueUrl(basePath, params, { sort: v }))
            })
          }}
          className="h-8 w-44 appearance-none rounded-md border border-input bg-card px-3 pr-8 text-sm font-medium shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      </div>
    </div>
  )
}

/** Mini-formulaire prix min / max (FCFA). */
export function PriceForm({
  basePath,
  params,
  currentMin,
  currentMax,
}: {
  basePath: string
  params: CatalogueParams
  currentMin?: number
  currentMax?: number
}) {
  const router = useRouter()
  const [min, setMin] = useState(currentMin ? String(currentMin) : "")
  const [max, setMax] = useState(currentMax ? String(currentMax) : "")
  const [error, setError] = useState("")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const minN = Number.parseInt(min, 10)
    const maxN = Number.parseInt(max, 10)
    if (min && (!Number.isFinite(minN) || minN < 0)) return setError("Prix minimum invalide.")
    if (max && (!Number.isFinite(maxN) || maxN < 0)) return setError("Prix maximum invalide.")
    if (min && max && minN > maxN) return setError("Le minimum dépasse le maximum.")
    setError("")
    router.push(
      buildCatalogueUrl(basePath, params, {
        min: min ? String(minN) : null,
        max: max ? String(maxN) : null,
      }),
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Min"
          aria-label="Prix minimum (FCFA)"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="h-9"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Max"
          aria-label="Prix maximum (FCFA)"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="h-9"
        />
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <Button type="submit" size="sm" className="w-full bg-brand text-brand-foreground hover:brightness-95">
        <Check className="mr-1 h-3.5 w-3.5" aria-hidden /> Appliquer
      </Button>
    </form>
  )
}

/** Bouton « Filtres » mobile → Sheet avec le contenu de la sidebar (server-rendered via children). */
export function MobileFilters({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <ClientOnly
      fallback={
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium text-muted-foreground lg:hidden" aria-hidden="true">
          <SlidersHorizontal className="h-4 w-4" /> Filtres
        </span>
      }
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 lg:hidden">
            <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filtres
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] overflow-y-auto sm:w-[320px]">
          <SheetHeader className="pb-2 text-left">
            <SheetTitle>Filtres</SheetTitle>
          </SheetHeader>
          <div
            className="px-4 pb-8"
            onClick={(e) => {
              // Ferme le Sheet après un clic sur un lien de filtre.
              if ((e.target as HTMLElement).closest("a")) setOpen(false)
            }}
          >
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </ClientOnly>
  )
}
