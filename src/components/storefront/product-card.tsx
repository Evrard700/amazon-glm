"use client"

import Link from "next/link"
import Image from "next/image"
import { Download, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useCartStore } from "@/lib/cart-store"
import { PriceTag } from "@/components/storefront/price"
import { RatingStars } from "@/components/storefront/rating-stars"

export interface ProductCardData {
  id: string
  name: string
  slug: string
  price: number
  salePrice: number | null
  images: string[]
  type: string
  stock: number
  trackInventory: boolean
  ratingAvg: number
  ratingCount: number
  isFeatured?: boolean
  saleEndsAt?: string | null
}

export function ProductCard({
  product,
  className,
  priority: isPriority = false,
}: {
  product: ProductCardData
  className?: string
  /** Préchargement LCP : à activer pour les premières cartes visibles (catalogue, sections en haut de page). */
  priority?: boolean
}) {
  const addItem = useCartStore((s) => s.addItem)
  const outOfStock = product.trackInventory && product.type !== "DIGITAL" && product.stock <= 0
  const onSale = product.salePrice != null && product.salePrice < product.price
  const image = product.images?.[0]

  return (
    // CSS pur : le survol (élévation + ombre) est déjà géré par les classes
    // transition-all/hover ci-dessous — l'ancien whileInView framer est retiré
    // (les grilles restent révélées par le Reveal de leur section).
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg",
        className,
      )}
    >
      <Link href={`/products/${product.slug}`} className="relative block aspect-square overflow-hidden bg-secondary/40">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            priority={isPriority}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Package size={36} strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {onSale && <Badge className="bg-brand text-brand-foreground shadow-sm">Promo</Badge>}
          {product.type === "DIGITAL" && (
            <Badge variant="secondary" className="bg-card/95 shadow-sm">
              <Download size={11} className="mr-1" /> Numérique
            </Badge>
          )}
          {product.isFeatured && !onSale && <Badge className="bg-primary text-primary-foreground shadow-sm">Coup de cœur</Badge>}
        </div>
        {outOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
            <span className="rounded-md bg-foreground px-3 py-1 text-xs font-semibold text-background">Rupture de stock</span>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <Link
          href={`/products/${product.slug}`}
          className="line-clamp-2 text-sm font-medium leading-snug hover:text-brand-foreground"
        >
          {product.name}
        </Link>
        {product.ratingCount > 0 && <RatingStars rating={product.ratingAvg} count={product.ratingCount} />}
        <PriceTag price={product.price} salePrice={product.salePrice} className="mt-auto" />
        <button
          type="button"
          disabled={outOfStock}
          onClick={() =>
            addItem(product.id, null, 1, {
              name: product.name,
              slug: product.slug,
              image,
              unitPrice: product.salePrice ?? product.price,
              type: product.type,
            })
          }
          className={cn(
            "mt-2 w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground shadow-sm transition-all",
            "hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {outOfStock ? "Indisponible" : "Ajouter au panier"}
        </button>
      </div>
    </div>
  )
}
