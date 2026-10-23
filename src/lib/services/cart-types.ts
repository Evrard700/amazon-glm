// Types partagés du moteur de calcul (panier / promotions / coupons)

export interface CartLine {
  itemId: string
  product: {
    id: string
    name: string
    slug: string
    type: string // PHYSICAL | DIGITAL | HYBRID
    price: number
    salePrice: number | null
    stock: number
    trackInventory: boolean
    status: string
    sku: string | null
    images: string[]
    requiresShipping: boolean
    digitalFileName: string | null
  }
  variant: {
    id: string
    name: string
    sku: string | null
    price: number | null
    stock: number
  } | null
  quantity: number
  /** Prix unitaire retenu (variante > promo > prix) — TOUJOURS issu de la DB */
  unitPrice: number
  lineTotal: number
}

export interface PromoExtraLine {
  productId: string
  productName: string
  productSlug: string
  sku: string | null
  unitPrice: number
  quantity: number
  message: string
}

export interface PromotionApplication {
  promotionId: string
  name: string
  badgeLabel?: string
  amount: number
  description: string
  freeLine: PromoExtraLine | null
  discountedLine: (PromoExtraLine & { discountPerUnit: number }) | null
  skippedReason: string | null
}

export interface CouponApplication {
  couponId: string
  code: string
  type: string
  amount: number
  description: string
  freeShipping: boolean
  freeLine: PromoExtraLine | null
}

export interface CartNote {
  level: "info" | "warning"
  message: string
}

export interface ComputedCart {
  lines: CartLine[]
  extraLines: PromoExtraLine[]
  subtotal: number
  promotionDiscount: number
  couponDiscount: number
  coupon: CouponApplication | null
  promotions: PromotionApplication[]
  notes: CartNote[]
  itemCount: number
  savings: number
}
