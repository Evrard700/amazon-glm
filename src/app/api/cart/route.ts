import { z } from "zod"
import { ok, handle, parseBody } from "@/lib/api"
import { enforceRateLimit } from "@/lib/rate-limit"
import {
  computeCart,
  computeCartFromRow,
  addProductToCart,
  setCartItemQuantity,
  removeCartItem,
  applyCouponToCart,
  removeCouponFromCart,
  clearCart,
} from "@/lib/services/cart"
import { formatXOF } from "@/lib/money"

export async function GET() {
  return handle(async () => {
    const cart = await computeCart()
    return ok(cart)
  })
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    productId: z.string().min(1),
    variantId: z.string().nullish(),
    quantity: z.number().int().min(1).max(99).default(1),
  }),
  z.object({ action: z.literal("update"), itemId: z.string().min(1), quantity: z.number().int() }),
  z.object({ action: z.literal("remove"), itemId: z.string().min(1) }),
  z.object({ action: z.literal("applyCoupon"), code: z.string().min(1).max(40) }),
  z.object({ action: z.literal("removeCoupon") }),
  z.object({ action: z.literal("clear") }),
])

export async function POST(request: Request) {
  return handle(async () => {
    // Anti-spam : un visiteur non connecté ne peut pas faire croître la base
    // à volonté (chaque « add » sans cookie crée un panier) ni brute-forcer
    // les codes promo (réponse différenciée = énumération).
    enforceRateLimit(request, "cart", 40, 60_000)
    const body = await parseBody(request, actionSchema)
    if (body.action === "applyCoupon") {
      enforceRateLimit(request, "cart-coupon", 12, 60_000)
    }
    // Chaque mutation renvoie la ligne panier FRAÎCHE → recalcul complet
    // SANS relire le cookie ni le panier (gain : 2 allers-retours Supabase).
    const row = await (async () => {
      switch (body.action) {
        case "add":
          return addProductToCart(body.productId, body.variantId ?? null, body.quantity)
        case "update":
          return setCartItemQuantity(body.itemId, body.quantity)
        case "remove":
          return removeCartItem(body.itemId)
        case "applyCoupon":
          return applyCouponToCart(body.code)
        case "removeCoupon":
          return removeCouponFromCart()
        case "clear":
          return clearCart()
      }
    })()
    const cart = await computeCartFromRow(row)
    let message: string | null = null
    if (body.action === "add") message = "Article ajouté au panier."
    if (body.action === "applyCoupon") {
      message = cart.coupon
        ? `Code ${cart.coupon.code} appliqué : ${cart.coupon.description}.`
        : "Ce code promo n'a pas pu être appliqué à votre panier."
    }
    return ok({ ...cart, message, totalFormatted: formatXOF(Math.max(0, cart.subtotal - cart.promotionDiscount - cart.couponDiscount)) })
  })
}
