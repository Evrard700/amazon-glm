import { cookies } from "next/headers"
import { randomUUID } from "crypto"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { ApiError } from "@/lib/api"
import { parseJson } from "@/lib/json"
import { getSessionUser } from "@/lib/auth"
import { getCatalog, getVariantsByIds } from "@/lib/catalog-data"
import { applyPromotions, applyCoupon, getCouponByCode, getCouponById } from "@/lib/services/promotions"
import type {
  CartLine,
  ComputedCart,
  CouponApplication,
  PromotionApplication,
  PromoExtraLine,
  CartNote,
} from "@/lib/services/cart-types"

export const CART_COOKIE = "tm_cart"

/** Ligne panier complète avec ses articles (include Prisma standard). */
export type CartRow = Prisma.CartGetPayload<{ include: { items: true } }>

type SessionUser = Awaited<ReturnType<typeof getSessionUser>>

const CART_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  // Le cookie panier (pivot de propriété) ne doit JAMAIS partir en HTTP clair
  // hors développement.
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
} as const

/**
 * Precision du suivi d'activité : lastActivityAt n'est réécrit que si la
 * dernière trace date de plus de 90 s (les paniers abandonnés se mesurent
 * en heures/jours). Économise un aller-retour Supabase sur QUASI CHAQUE
 * lecture/mutation du panier (le touch n'est plus systématique).
 */
const TOUCH_MAX_AGE_MS = 90_000

async function findCartByToken(token: string): Promise<CartRow | null> {
  return db.cart.findUnique({ where: { sessionToken: token }, include: { items: true } })
}

/** Fusion : rattache un panier invité au compte client (items dédupliqués). */
async function mergeGuestCartInto(existing: CartRow, userCart: CartRow): Promise<CartRow> {
  for (const item of existing.items) {
    const dup = userCart.items.find((i) => i.productId === item.productId && i.variantId === item.variantId)
    if (dup) {
      await db.cartItem.update({ where: { id: dup.id }, data: { quantity: dup.quantity + item.quantity } })
      await db.cartItem.delete({ where: { id: item.id } })
    } else {
      await db.cartItem.update({ where: { id: item.id }, data: { cartId: userCart.id } })
    }
  }
  await db.cart.update({ where: { id: existing.id }, data: { status: "MERGED" } })
  return userCart
}

/**
 * Récupère (ou crée) le panier associé au cookie de session et renvoie la
 * LIGNE COMPLÈTE (items inclus) — l'appelant n'a plus besoin de relire la DB.
 *
 * Correctif fluidité/correction : un panier CONVERTI (déjà commandé) n'est
 * JAMAIS réutilisé — un panier neuf est créé (l'ancien code pouvait y ajouter
 * des articles pour un client connecté, bloquant tout nouveau checkout).
 */
async function getOrCreateCartRow(userArg?: SessionUser): Promise<{ cart: CartRow; created: boolean; token: string }> {
  const user = userArg === undefined ? await getSessionUser() : userArg
  const store = await cookies()
  let token = store.get(CART_COOKIE)?.value

  if (token) {
    const existing = await findCartByToken(token)
    if (existing && existing.status === "ACTIVE") {
      return { cart: existing, created: false, token }
    }
    if (existing && user) {
      // Panier non actif (converti/fusionné) + client connecté : fusion vers
      // son panier actif si existant, sinon panier NEUF (jamais le panier mort).
      const userCart = await db.cart.findFirst({ where: { userId: user.id, status: "ACTIVE" }, include: { items: true } })
      if (userCart && userCart.id !== existing.id) {
        const merged = await mergeGuestCartInto(existing, userCart)
        token = merged.sessionToken
        store.set(CART_COOKIE, token, CART_COOKIE_OPTIONS)
        return { cart: merged, created: false, token }
      }
    }
  }

  // Nouveau panier
  const newToken = randomUUID()
  const cart = await db.cart.create({
    data: { sessionToken: newToken, userId: user?.id ?? null, status: "ACTIVE" },
    include: { items: true },
  })
  store.set(CART_COOKIE, newToken, CART_COOKIE_OPTIONS)
  return { cart, created: true, token: newToken }
}

/**
 * Compat : ancienne signature conservée pour les consommateurs externes
 * (checkout…) qui n'ont besoin que de l'identifiant.
 */
export async function getOrCreateCart(): Promise<{ cartId: string; created: boolean; token: string }> {
  const user = await getSessionUser()
  const { cart, created, token } = await getOrCreateCartRow(user)
  return { cartId: cart.id, created, token }
}

/** Panier vide sémantiquement identique au résultat complet sur 0 article. */
const EMPTY_CART: ComputedCart = {
  lines: [],
  extraLines: [],
  subtotal: 0,
  promotionDiscount: 0,
  couponDiscount: 0,
  coupon: null,
  promotions: [],
  notes: [],
  itemCount: 0,
  savings: 0,
}

function unitPriceOf(
  product: { price: number; salePrice: number | null },
  variant: { price: number | null } | null,
): number {
  if (variant && variant.price !== null) return variant.price
  return product.salePrice ?? product.price
}

/**
 * RECALCUL COMPLET côté serveur : prix, quantités, stock, promotions BXGY,
 * coupon, économies. Le navigateur ne fournit QUE les identifiants (produit,
 * variante, quantité) — jamais les prix ni les totaux.
 *
 * Lecture : SANS ÉCRITURE et SANS création de panier. Un visiteur sans
 * cookie panier (ou au panier vide sans coupon) obtient immédiatement le
 * panier vide — zéro requête produit/promotion/coupon ni écriture lastActivity.
 * La création (et le cookie associée) n'a lieu qu'à la première MUTATION
 * (add/update/remove/coupon/clear) via getOrCreateCartRow().
 */
export async function computeCart(options?: { ignoreCoupon?: boolean }): Promise<ComputedCart> {
  const store = await cookies()
  const token = store.get(CART_COOKIE)?.value
  if (token) {
    const existing = await findCartByToken(token)
    if (existing && existing.status === "ACTIVE") {
      // Early-exit : panier sans ligne ni coupon → réponse vide immédiate.
      if (existing.items.length === 0 && !existing.couponId) return { ...EMPTY_CART }
      return computeCartFromRow(existing, options)
    }
    if (existing) {
      // Panier converti/fusionné + cookie : comportement d'origine conservé
      // (fusion vers le panier client, sinon recréation d'un panier neuf).
      const user = await getSessionUser()
      const { cart } = await getOrCreateCartRow(user)
      return computeCartFromRow(cart, options)
    }
  }
  return { ...EMPTY_CART }
}

/**
 * Calcul complet sur une LIGNE panier déjà chargée (plus de relecture cookie
 * ni re-fetch) — utilisée par les mutations POST /api/cart qui disposent
 * déjà de l'état frais, et par computeCart ci-dessus.
 *
 * FLUIDITÉ v2 — le catalogue produits (prix, stock, images, catégories,
 * récompenses BXGY) vient du CACHE MÉMOIRE 15 s invalidé par CHAQUE mutation
 * admin/produit ET par chaque commande créée : en pratique toujours frais.
 * Seules les VARIANTES (lignes concernées) et le coupon restent en lectures
 * DB ciblées ; le touch lastActivityAt est en fire-and-forget.
 * Prix affichés = toujours ceux du serveur (jamais le navigateur).
 */
export async function computeCartFromRow(
  cart: CartRow,
  options?: { ignoreCoupon?: boolean },
): Promise<ComputedCart> {
  if (cart.items.length === 0 && !cart.couponId) return { ...EMPTY_CART }

  const notes: CartNote[] = []
  const lines: CartLine[] = []

  // SALVE 1 — session + catalogue (cache) + variantes (cache) + coupon
  // (cache 30 s) : ZÉRO requête DB quand tout est chaud.
  const [user, catalog, variantRows, couponRow] = await Promise.all([
    getSessionUser(),
    getCatalog(),
    getVariantsByIds(cart.items.filter((i) => i.variantId).map((i) => i.productId!)),
    cart.couponId && !options?.ignoreCoupon
      ? getCouponById(cart.couponId)
      : Promise.resolve(null),
  ])
  const productById = new Map(catalog.map((p) => [p.id, p]))
  const variantById = new Map(
    variantRows.filter((v) => v.isActive).map((v) => [v.id, v]),
  )

  for (let index = 0; index < cart.items.length; index++) {
    const item = cart.items[index]
    // Catalogue en cache = produits ACTIFS non supprimés (filtre identique à
    // l'ancien findFirst {id, deletedAt: null} + contrôle status ACTIVE) :
    // absent du cache → indisponible, note d'avertissement identique.
    const product = productById.get(item.productId)
    const variant = item.variantId ? (variantById.get(item.variantId) ?? null) : null
    if (!product) {
      notes.push({ level: "warning", message: `Un article de votre panier n'est plus disponible et sera retiré.` })
      continue
    }
    if (item.variantId && !variant) {
      notes.push({ level: "warning", message: `Une variante de votre panier n'est plus disponible.` })
      continue
    }
    let quantity = Math.max(1, Math.floor(item.quantity))
    // Stock : jamais au-delà du disponible
    if (product.type !== "DIGITAL" && product.trackInventory) {
      const stock = variant ? variant.stock : product.stock
      if (stock <= 0) {
        notes.push({ level: "warning", message: `${product.name} est en rupture de stock — retiré du panier.` })
        await db.cartItem.delete({ where: { id: item.id } })
        continue
      }
      if (quantity > stock) {
        quantity = stock
        notes.push({
          level: "warning",
          message: `Quantité de « ${product.name} » ajustée au stock disponible (${stock}).`,
        })
      }
    }

    const unitPrice = unitPriceOf(product, variant)
    lines.push({
      itemId: item.id,
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        type: product.type,
        price: product.price,
        salePrice: product.salePrice,
        stock: product.trackInventory ? (variant ? variant.stock : product.stock) : 999999,
        trackInventory: product.trackInventory,
        status: "ACTIVE",
        sku: product.sku,
        images: parseJson<string[]>(product.imagesJson, []),
        requiresShipping: product.requiresShipping,
        digitalFileName: product.digitalFileName,
      },
      variant: variant ? { id: variant.id, name: variant.name, sku: variant.sku, price: variant.price, stock: variant.stock } : null,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
    })
  }

  // Promotions « Achetez X obtenez Y » (moteur serveur, lectures cacheées)
  const promotions = await applyPromotions(lines, user?.id ?? null)
  const activePromotions = promotions.filter((p) => p.amount > 0 || p.freeLine || p.discountedLine)
  const promotionDiscount = activePromotions.reduce((s, p) => s + p.amount, 0)

  // Lignes supplémentaires (produits offerts / remisés)
  const extraLines: PromoExtraLine[] = []
  for (const p of activePromotions) {
    if (p.freeLine) extraLines.push(p.freeLine)
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0) + extraLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
  const subtotalAfterPromotions = Math.max(0, subtotal - promotionDiscount)

  // Coupon (validé serveur — ligne déjà chargée dans la salve 1)
  let coupon: CouponApplication | null = null
  if (couponRow && !options?.ignoreCoupon) {
    const result = await applyCoupon(
      couponRow.code,
      lines,
      activePromotions,
      subtotalAfterPromotions,
      user?.id ?? null,
      couponRow,
    )
    if (result.ok) {
      coupon = result.coupon
      if (coupon.freeLine) extraLines.push(coupon.freeLine)
    } else {
      notes.push({ level: "warning", message: `${couponRow.code} : ${result.reason}` })
      await db.cart.update({ where: { id: cart.id }, data: { couponId: null } })
    }
  }

  const couponDiscount = coupon?.amount ?? 0
  const savings = promotionDiscount + couponDiscount

  // Touch throttlé + FIRE-AND-FORGET : ≤ 1 écriture lastActivityAt / 90 s
  // (paniers abandonnés mesurés en heures) sans jamais bloquer la réponse.
  const lastTouch = cart.lastActivityAt?.getTime() ?? 0
  if (Date.now() - lastTouch > TOUCH_MAX_AGE_MS) {
    void db.cart
      .update({ where: { id: cart.id }, data: { lastActivityAt: new Date() } })
      .catch(() => undefined)
  }

  return {
    lines,
    extraLines,
    subtotal,
    promotionDiscount,
    couponDiscount,
    coupon,
    promotions: activePromotions,
    notes,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    savings,
  }
}

// ---------- Mutations panier ----------
// Chaque mutation renvoie la ligne panier FRAÎCHE (items patchés en mémoire)
// → la route POST calcule le panier complet SANS relire cookie ni panier.

export async function addProductToCart(
  productId: string,
  variantId: string | null,
  quantity: number,
): Promise<CartRow> {
  // Validation via le catalogue en cache (0 requête quand chaud) — la
  // disponibilité réelle est re-vérifiée au calcul du panier puis de façon
  // ATOMIQUE au checkout (décrément conditionnel).
  const [user, catalog] = await Promise.all([getSessionUser(), getCatalog()])
  const product = catalog.find((p) => p.id === productId)
  if (!product) throw new ApiError("Ce produit n'existe pas ou n'est pas disponible.", 404)

  let variantStock: number | null = null
  if (variantId) {
    // Variante via le cache catalogue (invalidée par toute mutation stock/admin)
    const variant = (await getVariantsByIds([productId])).find(
      (v) => v.id === variantId && v.isActive,
    )
    if (!variant) throw new ApiError("Cette variante n'existe pas.", 404)
    if (product.type !== "DIGITAL" && product.trackInventory && variant.stock <= 0) {
      throw new ApiError("Cette variante est en rupture de stock.", 409)
    }
    variantStock = variant.stock
  } else if (product.type !== "DIGITAL" && product.trackInventory && product.stock <= 0) {
    throw new ApiError("Ce produit est en rupture de stock.", 409)
  }

  const qty = Math.max(1, Math.min(Math.floor(quantity) || 1, 99))
  const { cart } = await getOrCreateCartRow(user)

  const existing = cart.items.find((i) => i.productId === productId && i.variantId === variantId)
  if (existing) {
    // Vérification stock vs total quantité
    const productStock = product.type === "DIGITAL" || !product.trackInventory ? 9999 : product.stock
    const cap = variantId ? (variantStock ?? 0) : productStock
    const newQty = Math.min(existing.quantity + qty, cap)
    if (newQty <= existing.quantity) throw new ApiError("Stock insuffisant pour ajouter davantage.", 409)
    const updatedItem = await db.cartItem.update({ where: { id: existing.id }, data: { quantity: newQty, updatedAt: new Date() } })
    return { ...cart, items: cart.items.map((i) => (i.id === updatedItem.id ? updatedItem : i)) }
  }

  const createdItem = await db.cartItem.create({ data: { cartId: cart.id, productId, variantId, quantity: qty } })
  return { ...cart, items: [...cart.items, createdItem] }
}

export async function setCartItemQuantity(itemId: string, quantity: number): Promise<CartRow> {
  const { cart } = await getOrCreateCartRow()
  const item = cart.items.find((i) => i.id === itemId)
  if (!item) throw new ApiError("Article introuvable dans votre panier.", 404)

  if (quantity <= 0) {
    await db.cartItem.delete({ where: { id: item.id } })
    return { ...cart, items: cart.items.filter((i) => i.id !== item.id) }
  }

  const qty = Math.min(Math.floor(quantity), 99)
  if (item.variantId) {
    // Variante : stock via le cache catalogue (invalidé à CHAQUE décrément)
    const variant = (await getVariantsByIds([item.productId])).find((v) => v.id === item.variantId)
    const product = (await getCatalog()).find((p) => p.id === item.productId)
    if (variant && product && product.type !== "DIGITAL" && product.trackInventory) {
      if (qty > variant.stock) {
        throw new ApiError(`Stock insuffisant : seulement ${variant.stock} unité(s) disponible(s).`, 409)
      }
    }
  } else {
    // Produit simple : stock depuis le catalogue en cache (invalidé à CHAQUE
    // changement de stock : commandes + admin inventaire) — 0 requête.
    const product = (await getCatalog()).find((p) => p.id === item.productId)
    if (product && product.type !== "DIGITAL" && product.trackInventory) {
      if (qty > product.stock) {
        throw new ApiError(`Stock insuffisant : seulement ${product.stock} unité(s) disponible(s).`, 409)
      }
    }
  }
  const updatedItem = await db.cartItem.update({ where: { id: item.id }, data: { quantity: qty, updatedAt: new Date() } })
  return { ...cart, items: cart.items.map((i) => (i.id === item.id ? updatedItem : i)) }
}

export async function removeCartItem(itemId: string): Promise<CartRow> {
  const user = await getSessionUser()
  const { cart } = await getOrCreateCartRow(user)
  const item = cart.items.find((i) => i.id === itemId)
  if (!item) throw new ApiError("Article introuvable dans votre panier.", 404)
  await db.cartItem.delete({ where: { id: item.id } })
  return { ...cart, items: cart.items.filter((i) => i.id !== item.id) }
}

export async function applyCouponToCart(code: string): Promise<CartRow> {
  const clean = code.trim().toUpperCase()
  if (!clean) throw new ApiError("Veuillez saisir un code promo.", 400)
  const user = await getSessionUser()
  // Coupon via cache 30 s (purgé par les routes admin coupons) — la
  // validation financière complète (montants, limites, dates) est refaite
  // dans computeCartFromRow() à chaque lecture du panier.
  const [coupon, { cart }] = await Promise.all([
    getCouponByCode(clean),
    getOrCreateCartRow(user),
  ])
  if (!coupon || !coupon.isActive) throw new ApiError("Ce code promo n'existe pas ou n'est plus actif.", 404)
  await db.cart.update({ where: { id: cart.id }, data: { couponId: coupon.id } })
  // La validation réelle (montants, limites, dates) se fait dans computeCartFromRow()
  return { ...cart, couponId: coupon.id }
}

export async function removeCouponFromCart(): Promise<CartRow> {
  const user = await getSessionUser()
  const { cart } = await getOrCreateCartRow(user)
  if (!cart.couponId) return cart // déjà propre : aucune écriture
  await db.cart.update({ where: { id: cart.id }, data: { couponId: null } })
  return { ...cart, couponId: null }
}

export async function clearCart(): Promise<CartRow> {
  const user = await getSessionUser()
  const { cart } = await getOrCreateCartRow(user)
  if (cart.items.length === 0 && !cart.couponId) return cart // déjà vide : aucune écriture
  await Promise.all([
    cart.items.length > 0
      ? db.cartItem.deleteMany({ where: { cartId: cart.id } })
      : Promise.resolve(0),
    cart.couponId
      ? db.cart.update({ where: { id: cart.id }, data: { couponId: null } })
      : Promise.resolve(null),
  ])
  return { ...cart, items: [], couponId: null }
}
