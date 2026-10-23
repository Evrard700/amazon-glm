"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ChevronDown, ChevronRight, Package, Save, TriangleAlert } from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { useAdminApi } from "@/components/admin/api-client"
import { StockBadge } from "@/components/admin/shared/badges"
import { parseJson } from "@/lib/json"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface InventoryVariant {
  id: string
  name: string
  sku: string | null
  stock: number
  isActive: boolean
  options: Record<string, string>
}

interface InventoryProduct {
  id: string
  name: string
  slug: string
  sku: string | null
  type: string
  status: string
  stock: number
  imagesJson: string
  salesCount: number
  variants: InventoryVariant[]
}

interface InventoryData {
  lowStockThreshold: number
  products: InventoryProduct[]
}

/** Édition rapide du stock : la valeur saisie est envoyée uniquement au clic sur Enregistrer. */
function StockEditor({
  initial,
  onSave,
  disabled,
}: {
  initial: number
  onSave: (stock: number) => Promise<void>
  disabled?: boolean
}) {
  const [value, setValue] = useState(String(initial))
  const [saving, setSaving] = useState(false)
  const dirty = Math.round(Number(value) || 0) !== initial

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled || saving}
        className="h-8 w-20 text-sm tabular-nums"
        aria-label="Nouvelle valeur de stock"
      />
      <Button
        type="button"
        size="icon"
        variant={dirty ? "default" : "ghost"}
        className="h-8 w-8"
        disabled={disabled || saving || !dirty || Number(value) < 0}
        aria-label="Enregistrer le stock"
        onClick={async () => {
          setSaving(true)
          await onSave(Math.round(Number(value) || 0))
          setSaving(false)
        }}
      >
        <Save className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

export default function AdminInventoryPage() {
  const api = useAdminApi()
  const [data, setData] = useState<InventoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<"ALL" | "LOW" | "OUT">("ALL")

  const load = useCallback(async () => {
    setLoading(true)
    const result = await api.get<InventoryData>("/api/admin/inventory")
    if (result) setData(result)
    setLoading(false)
     
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const threshold = data?.lowStockThreshold ?? 5

  const filtered = useMemo(() => {
    if (!data) return []
    return data.products.filter((p) => {
      const total = p.variants.length > 0 ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock
      if (filter === "OUT") return total <= 0
      if (filter === "LOW") return total > 0 && total <= threshold
      return true
    })
  }, [data, filter, threshold])

  async function saveStock(payload: { productId?: string; variantId?: string }, stock: number) {
    const result = await api.patch<{ stock: number }>("/api/admin/inventory", { ...payload, stock })
    if (result) {
      toast.success("Stock ajusté et journalisé.")
      load()
    }
  }

  const stats = useMemo(() => {
    if (!data) return { out: 0, low: 0 }
    let out = 0
    let low = 0
    for (const p of data.products) {
      const total = p.variants.length > 0 ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock
      if (total <= 0) out++
      else if (total <= threshold) low++
    }
    return { out, low }
  }, [data, threshold])

  return (
    <div className="p-4 sm:p-6">
      <AdminPageHeader
        title="Inventaire"
        description={`Suivi du stock physique et des variantes. Seuil d'alerte paramétrable : ${threshold} unité(s).`}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <Card className={cn("rounded-xl border bg-card", stats.out > 0 && "border-rose-300")}>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <TriangleAlert className="h-3.5 w-3.5" /> Ruptures
            </p>
            <p className="mt-1 text-2xl font-extrabold">{stats.out}</p>
          </CardContent>
        </Card>
        <Card className={cn("rounded-xl border bg-card", stats.low > 0 && "border-amber-300")}>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sous le seuil</p>
            <p className="mt-1 text-2xl font-extrabold">{stats.low}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-3 flex gap-2">
        {(
          [
            { value: "ALL", label: "Tous" },
            { value: "LOW", label: `Stock faible (≤ ${threshold})` },
            { value: "OUT", label: "En rupture" },
          ] as const
        ).map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Aucun produit ne correspond à ce filtre.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
            <ul className="divide-y">
              {filtered.map((p) => {
                const variantsStock = p.variants.reduce((s, v) => s + v.stock, 0)
                const isOpen = expanded.has(p.id)
                return (
                  <li key={p.id}>
                    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() =>
                          setExpanded((s) => {
                            const next = new Set(s)
                            if (next.has(p.id)) next.delete(p.id)
                            else next.add(p.id)
                            return next
                          })
                        }
                        aria-label={isOpen ? "Replier les variantes" : "Déplier les variantes"}
                      >
                        {p.variants.length > 0 ? (
                          isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
                        ) : (
                          <span className="w-4" />
                        )}
                        <span className="min-w-0">
                          <Link href={`/admin/products/${p.id}`} className="block truncate text-sm font-medium hover:underline">
                            {p.name}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.sku ?? "sans SKU"} · {p.variants.length > 0 ? `${p.variants.length} variante(s)` : `${p.salesCount} vente(s)`}
                          </span>
                        </span>
                      </button>
                      <StockBadge
                        stock={p.variants.length > 0 ? variantsStock : p.stock}
                        threshold={threshold}
                      />
                      <StockEditor
                        initial={p.stock}
                        onSave={(stock) => saveStock({ productId: p.id }, stock)}
                        disabled={p.variants.length > 0}
                      />
                      {p.variants.length > 0 && (
                        <Badge variant="outline" className="border bg-neutral-100 text-neutral-500 border-neutral-200">
                          <Package className="mr-1 h-3 w-3" /> par variante
                        </Badge>
                      )}
                    </div>
                    {isOpen && p.variants.length > 0 && (
                      <ul className="divide-y border-t bg-secondary/30">
                        {p.variants.map((v) => (
                          <li key={v.id} className="flex flex-wrap items-center gap-3 px-3 py-2 pl-10">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm">
                                {v.name} {!v.isActive && <Badge variant="outline" className="ml-1 border bg-neutral-100 text-neutral-500 border-neutral-200">Inactive</Badge>}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{v.sku ?? "sans SKU"}</p>
                            </div>
                            <StockBadge stock={v.stock} threshold={threshold} />
                            <StockEditor initial={v.stock} onSave={(stock) => saveStock({ variantId: v.id }, stock)} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
