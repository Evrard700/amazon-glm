// Mapping ligne Prisma Product → ProductCardData (partagé sections + catalogue).
// Aucune logique métier ici : pure sérialisation des colonnes JSON.
import type { ProductCardData } from "@/components/storefront/product-card"
import { parseJson } from "@/lib/json"

export interface RawCardProduct {
  id: string
  name: string
  slug: string
  price: number
  salePrice: number | null
  imagesJson: string
  type: string
  stock: number
  trackInventory: boolean
  ratingAvg: number
  ratingCount: number
  isFeatured: boolean
}

export function toProductCardData(p: RawCardProduct): ProductCardData {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    salePrice: p.salePrice,
    images: parseJson<string[]>(p.imagesJson, []),
    type: p.type,
    stock: p.stock,
    trackInventory: p.trackInventory,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    isFeatured: p.isFeatured,
  }
}
