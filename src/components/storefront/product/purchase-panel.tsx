"use client"

// Panneau d'achat — variantes (pills, requises), quantité plafonnée au stock,
// bouton « Ajouter au panier » ambre avec retour (drawer + toast via cart-store).
import { useMemo, useState } from "react"
import { Loader2, Minus, Plus, ShoppingCart } from "lucide-react"
import { toast } from "sonner"
import { useCartStore, type OptimisticItemInfo } from "@/lib/cart-store"
import { formatXOF } from "@/lib/money"
import { PriceTag } from "@/components/storefront/price"
import { cn } from "@/lib/utils"

export interface VariantOption {
  id: string
  name: string
  price: number | null // surcharge optionnelle
  stock: number
}

export function PurchasePanel({
  productId,
  type,
  trackInventory,
  basePrice,
  baseSalePrice,
  baseStock,
  variants,
  lowStockThreshold,
  optimistic,
}: {
  productId: string
  type: string
  trackInventory: boolean
  basePrice: number
  baseSalePrice: number | null
  baseStock: number
  variants: VariantOption[]
  lowStockThreshold: number
  /** Infos pour la ligne optimiste instantanée (nom/image de la fiche produit). */
  optimistic?: Omit<OptimisticItemInfo, "unitPrice" | "variantName">
}) {
  const addItem = useCartStore((s) => s.addItem)
  const [variantId, setVariantId] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [loading, setLoading] = useState(false)

  const hasVariants = variants.length > 0
  const isDigital = type === "DIGITAL"
  const selected = useMemo(
    () => variants.find((v) => v.id === variantId) ?? null,
    [variants, variantId],
  )

  const price = selected?.price ?? basePrice
  const salePrice = selected?.price != null ? null : baseSalePrice
  const stock = selected ? selected.stock : baseStock
  const managesStock = trackInventory && !isDigital

  const outOfStock = managesStock && stock <= 0
  const qtyMax = managesStock ? Math.max(1, stock) : 99
  const needsVariant = hasVariants && !selected

  function stockInfo(): { text: string; tone: "ok" | "warn" | "bad" } {
    if (isDigital) return { text: "Disponible immédiatement", tone: "ok" }
    if (!managesStock) return { text: "En stock", tone: "ok" }
    if (needsVariant) return { text: "Sélectionnez une option pour voir le stock", tone: "warn" }
    if (stock <= 0) return { text: "Rupture de stock", tone: "bad" }
    if (stock <= lowStockThreshold) return { text: `Plus que ${stock} en stock`, tone: "warn" }
    return { text: `En stock (${stock})`, tone: "ok" }
  }
  const info = stockInfo()

  async function handleAdd() {
    if (needsVariant) {
      toast.error("Choisissez d'abord une option pour ce produit.")
      return
    }
    setLoading(true)
    try {
      // Ligne optimiste : le tiroir s'ouvre immédiatement avec l'article
      const optimisticInfo = optimistic
        ? {
            name: optimistic.name,
            slug: optimistic.slug,
            image: optimistic.image,
            type: optimistic.type,
            unitPrice: salePrice ?? price,
            variantName: selected?.name ?? null,
          }
        : undefined
      await addItem(productId, selected?.id ?? null, qty, optimisticInfo)
      // succès : toast + drawer ouverts par le store
    } finally {
      setLoading(false)
    }
  }

  const disabled = loading || outOfStock || needsVariant
  const buttonLabel = outOfStock
    ? "Indisponible"
    : needsVariant
      ? "Choisir une option"
      : "Ajouter au panier"

  const toneClass = {
    ok: "text-emerald-700",
    warn: "text-amber-600",
    bad: "text-rose-600",
  }[info.tone]

  return (
    <div className="space-y-4">
      <PriceTag price={price} salePrice={salePrice} size="lg" />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className={cn("font-semibold", toneClass)}>{info.text}</span>
      </div>

      {hasVariants && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">
            Choisir une option <span className="text-rose-600">*</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const vOut = managesStock && v.stock <= 0
              const active = variantId === v.id
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={vOut}
                  onClick={() => {
                    setVariantId(v.id)
                    setQty(1)
                  }}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium transition",
                    active
                      ? "border-brand bg-brand-soft text-brand-foreground shadow-sm"
                      : "bg-card hover:border-foreground/30",
                    vOut && "cursor-not-allowed text-muted-foreground line-through opacity-40",
                  )}
                >
                  {v.name}
                  {v.price != null ? ` — ${formatXOF(v.price)}` : ""}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Quantité */}
        <div className="flex h-12 w-fit items-center rounded-lg border bg-card shadow-sm">
          <button
            type="button"
            aria-label="Diminuer la quantité"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            className="grid h-full w-11 place-items-center rounded-l-lg transition hover:bg-secondary disabled:opacity-30"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span className="w-12 text-center text-sm font-bold tabular-nums" aria-live="polite" aria-label={`Quantité : ${qty}`}>
            {qty}
          </span>
          <button
            type="button"
            aria-label="Augmenter la quantité"
            onClick={() => setQty((q) => Math.min(qtyMax, q + 1))}
            disabled={qty >= qtyMax}
            className="grid h-full w-11 place-items-center rounded-r-lg transition hover:bg-secondary disabled:opacity-30"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Ajout au panier */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled}
          className={cn(
            "inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-6 text-sm font-bold text-brand-foreground shadow-md transition sm:text-base",
            "hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <ShoppingCart className="h-5 w-5" aria-hidden />
          )}
          {buttonLabel}
        </button>
      </div>

      {managesStock && stock > 0 && stock <= lowStockThreshold && !needsVariant && (
        <p className="text-xs font-medium text-amber-600">
          ⚡ Stock limité — commandez vite avant la rupture.
        </p>
      )}
    </div>
  )
}
