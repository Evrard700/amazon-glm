import { db } from "@/lib/db"
import { cached } from "@/lib/cache"
import { parseJson } from "@/lib/json"
import { percentOf } from "@/lib/money"
import { getCatalog, type CatalogProduct } from "@/lib/catalog-data"
import type { CartLine, CouponApplication, PromotionApplication, PromoExtraLine } from "@/lib/services/cart-types"
import type { Coupon } from "@prisma/client"

interface PromotionRow {
  id: string
  name: string
  ruleType: string
  requiredQty: number
  rewardQty: number
  rewardProductId: string | null
  discountPercent: number | null
  appliesTo: string
  productIdsJson: string
  categoryIdsJson: string
  minOrderAmount: number
  priority: number
  combinable: boolean
  maxUses: number | null
  usedCount: number
  perCustomerLimit: number
  badgeLabel: string | null
  isActive: boolean
  startsAt: Date | null
  endsAt: Date | null
}

export function maxUsesReached(promo: { maxUses: number | null; usedCount: number }): boolean {
  return promo.maxUses !== null && promo.usedCount >= promo.maxUses
}

function scopeMatches(
  promo: PromotionRow,
  line: CartLine,
  categoriesByProduct: Map<string, Set<string>>,
): boolean {
  if (promo.appliesTo === "ALL") return true
  if (promo.appliesTo === "PRODUCTS") {
    return parseJson<string[]>(promo.productIdsJson, []).includes(line.product.id)
  }
  if (promo.appliesTo === "CATEGORIES") {
    const cats = parseJson<string[]>(promo.categoryIdsJson, [])
    const own = categoriesByProduct.get(line.product.id) ?? new Set<string>()
    return cats.some((c) => own.has(c))
  }
  return false
}

/** Lecture cacheée d'un code promo par code — TTL 30 s, purgée par les routes admin coupons. */
export function getCouponByCode(code: string): Promise<Coupon | null> {
  const clean = code.trim().toUpperCase()
  return cached(`catalog:coupon:${clean}`, 30_000, () =>
    db.coupon.findUnique({ where: { code: clean } }),
  )
}

/** Lecture cacheée d'un code promo par identifiant (validation panier) — purgée avec les coupons. */
export function getCouponById(id: string): Promise<Coupon | null> {
  return cached(`catalog:coupon:byid:${id}`, 30_000, () =>
    db.coupon.findUnique({ where: { id } }),
  )
}

/**
 * Applique les promotions « Achetez X, obtenez Y » sur les lignes du panier.
 * Tout est calculé côté serveur à partir des prix de la base.
 * - BUY_X_GET_Y_SAME          : achetez requiredQty unités éligibles → les rewardQty moins chères offertes.
 * - BUY_X_GET_PRODUCT_FREE    : achetez requiredQty unités déclencheuses → rewardProductId × rewardQty offert.
 * - BUY_X_GET_PRODUCT_DISCOUNT: achetez requiredQty unités → rewardProductId à -discountPercent %.
 * Cumul : une promotion « non cumulable » appliquée empêche les suivantes non cumulables.
 */
export async function applyPromotions(
  lines: CartLine[],
  userId: string | null,
): Promise<PromotionApplication[]> {
  if (lines.length === 0) return []

  // Liste des promotions actives — cache mémoire 30 s (invalidé par les
  // mutations admin promotions ET par chaque commande créée qui consomme
  // les limites) ; seul le LISTAGE est caché, jamais le calcul.
  const promos = await cached("promotions:active", 30_000, async () =>
    db.promotion.findMany({
      where: {
        isActive: true,
        // startsAt/endsAt NULL = sans limite ; sinon fenêtre de validité
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
        ],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
  ) as unknown as PromotionRow[]
  if (promos.length === 0) return []

  const productIds = [...new Set(lines.map((l) => l.product.id))]
  const rewardProductIds = [...new Set(promos.map((p) => p.rewardProductId).filter((x): x is string => !!x))]

  // FLUIDITÉ — le catalogue en cache mémoire (15 s, invalidé par CHAQUE
  // mutation admin produit/catégorie ET par chaque commande) contient déjà :
  //   - les liaisons produit↔catégorie (categoryIds)
  //   - les produits récompense (prix, stock, type, sku)
  //   - l'historique client est la SEULE lecture DB restante (1 requête,
  //     clients connectés uniquement) — tout le reste vient du cache.
  // Repli frais uniquement pour les ids absents du catalogue (simulation
  // admin sur des produits non publiés).
  const catalog = await getCatalog()
  const catalogById = new Map<string, CatalogProduct>(catalog.map((p) => [p.id, p]))

  const [missingLinks, missingRewards, userOrders] = await Promise.all([
    (async () => {
      const missingIds = productIds.filter((id) => !catalogById.has(id))
      if (missingIds.length === 0) return []
      return db.productCategory.findMany({ where: { productId: { in: missingIds } } })
    })(),
    (async () => {
      const missingIds = rewardProductIds.filter((id) => !catalogById.has(id))
      if (missingIds.length === 0) return []
      return db.product.findMany({
        where: { id: { in: missingIds }, status: "ACTIVE", deletedAt: null },
      })
    })(),
    userId
      ? db.order.findMany({ where: { userId }, select: { promotionsJson: true } })
      : Promise.resolve([] as { promotionsJson: string }[]),
  ])

  const categoriesByProduct = new Map<string, Set<string>>()
  for (const p of catalog) categoriesByProduct.set(p.id, new Set(p.categoryIds))
  for (const link of missingLinks) {
    if (!categoriesByProduct.has(link.productId)) categoriesByProduct.set(link.productId, new Set())
    categoriesByProduct.get(link.productId)!.add(link.categoryId)
  }
  const rewardProductById = new Map<string, CatalogProduct | (typeof missingRewards)[number]>()
  for (const id of rewardProductIds) {
    const hit = catalogById.get(id)
    if (hit) rewardProductById.set(id, hit)
  }
  for (const p of missingRewards) rewardProductById.set(p.id, p)

  // Usage par client (limite par client)
  const usedCountByPromoForUser = new Map<string, number>()
  for (const o of userOrders) {
    for (const a of parseJson<{ promotionId: string }[]>(o.promotionsJson, [])) {
      usedCountByPromoForUser.set(a.promotionId, (usedCountByPromoForUser.get(a.promotionId) ?? 0) + 1)
    }
  }

  const applications: PromotionApplication[] = []
  let nonCombinableApplied = false
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)

  for (const promo of promos) {
    if (maxUsesReached(promo)) continue
    const userUsed = usedCountByPromoForUser.get(promo.id) ?? 0
    if (promo.perCustomerLimit > 0 && userUsed >= promo.perCustomerLimit) continue
    if (!promo.combinable && nonCombinableApplied) continue
    if (promo.minOrderAmount > 0 && subtotal < promo.minOrderAmount) continue

    const eligibleLines: CartLine[] = []
    for (const line of lines) {
      if (scopeMatches(promo, line, categoriesByProduct)) eligibleLines.push(line)
    }

    const totalEligibleUnits = eligibleLines.reduce((s, l) => s + l.quantity, 0)
    const app: PromotionApplication = {
      promotionId: promo.id,
      name: promo.name,
      badgeLabel: promo.badgeLabel ?? undefined,
      amount: 0,
      description: "",
      freeLine: null,
      discountedLine: null,
      skippedReason: null,
    }

    if (promo.ruleType === "BUY_X_GET_Y_SAME") {
      const times = Math.floor(totalEligibleUnits / promo.requiredQty)
      if (times <= 0) continue
      const freeUnits = times * promo.rewardQty
      const units: number[] = []
      eligibleLines.forEach((line) => {
        for (let i = 0; i < line.quantity; i++) units.push(line.unitPrice)
      })
      units.sort((a, b) => a - b)
      app.amount = units.slice(0, freeUnits).reduce((s, u) => s + u, 0)
      app.description = `${times} × « ${promo.name} » : ${freeUnits} unité(s) offerte(s).`
      applications.push(app)
      if (!promo.combinable) nonCombinableApplied = true
      continue
    }

    // Règles avec produit récompense
    if (totalEligibleUnits < promo.requiredQty) continue
    if (!promo.rewardProductId) continue
    const rewardProduct = rewardProductById.get(promo.rewardProductId)
    if (!rewardProduct) continue
    const unit = rewardProduct.salePrice ?? rewardProduct.price
    const physicalStockNeeded = rewardProduct.type === "DIGITAL" ? 0 : promo.rewardQty
    if (physicalStockNeeded > 0 && rewardProduct.stock < physicalStockNeeded) continue

    if (promo.ruleType === "BUY_X_GET_PRODUCT_FREE") {
      app.amount = unit * promo.rewardQty
      app.freeLine = {
        productId: rewardProduct.id,
        productName: rewardProduct.name,
        productSlug: rewardProduct.slug,
        sku: rewardProduct.sku,
        unitPrice: unit,
        quantity: promo.rewardQty,
        message: `Offert par la promotion « ${promo.name} »`,
      }
      app.description = `« ${promo.name} » : ${rewardProduct.name} offert.`
      applications.push(app)
      if (!promo.combinable) nonCombinableApplied = true
    } else if (promo.ruleType === "BUY_X_GET_PRODUCT_DISCOUNT") {
      const percent = promo.discountPercent ?? 0
      const discountPerUnit = percentOf(unit, percent)
      app.amount = discountPerUnit * promo.rewardQty
      app.discountedLine = {
        productId: rewardProduct.id,
        productName: rewardProduct.name,
        productSlug: rewardProduct.slug,
        sku: rewardProduct.sku,
        unitPrice: unit,
        quantity: promo.rewardQty,
        discountPerUnit,
        message: `-${percent} % grâce à la promotion « ${promo.name} »`,
      }
      app.description = `« ${promo.name} » : ${rewardProduct.name} à -${percent} %.`
      applications.push(app)
      if (!promo.combinable) nonCombinableApplied = true
    }
  }

  return applications
}

/**
 * Valide un coupon pour un panier donné. Retourne l'application ou un refus motivé.
 * `preload` : ligne coupon déjà lue par l'appelant (évite un aller-retour).
 */
export async function applyCoupon(
  code: string,
  lines: CartLine[],
  promotions: PromotionApplication[],
  subtotalAfterPromotions: number,
  userId: string | null,
  preload?: Coupon | null,
): Promise<{ ok: true; coupon: CouponApplication } | { ok: false; reason: string }> {
  const clean = code.trim().toUpperCase()
  if (!clean) return { ok: false, reason: "Veuillez saisir un code promo." }

  const coupon = preload ?? (await getCouponByCode(clean))
  if (!coupon || !coupon.isActive) return { ok: false, reason: "Ce code promo n'existe pas ou n'est plus actif." }

  const now = new Date()
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, reason: "Ce code promo n'est pas encore actif." }
  if (coupon.expiresAt && coupon.expiresAt < now) return { ok: false, reason: "Ce code promo a expiré." }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, reason: "Ce code promo a atteint sa limite d'utilisation." }
  }
  if (coupon.userId && (!userId || userId !== coupon.userId)) {
    return { ok: false, reason: "Ce code promo est réservé à un autre client." }
  }
  if (userId) {
    const myUses = await db.couponRedemption.count({ where: { couponId: coupon.id, userId } })
    if (coupon.perCustomerLimit > 0 && myUses >= coupon.perCustomerLimit) {
      return { ok: false, reason: "Vous avez déjà utilisé ce code promo le nombre maximum de fois." }
    }
  } else if (coupon.perCustomerLimit > 0) {
    // Invité : limite par client impossible à vérifier sans compte → refus pour les coupons personnels
    const hasAccount = await db.couponRedemption.findFirst({ where: { couponId: coupon.id, userId: coupon.userId } })
    if (hasAccount) return { ok: false, reason: "Ce code promo est réservé aux clients connectés." }
  }

  // Périmètre
  const inScope = (line: CartLine): boolean => {
    if (coupon.appliesTo === "ALL") return true
    if (coupon.appliesTo === "PRODUCTS") return parseJson<string[]>(coupon.productIdsJson, []).includes(line.product.id)
    return false // CATEGORIES géré en dessous
  }
  let scopedLines = lines.filter(inScope)
  if (coupon.appliesTo === "CATEGORIES") {
    const cats = parseJson<string[]>(coupon.categoryIdsJson, [])
    if (cats.length > 0) {
      // Produits des catégories du coupon : lus depuis le catalogue en cache
      // (categoryIds) — zéro requête, frais après chaque mutation admin.
      const catalog = await getCatalog()
      const scopedIds = new Set(
        catalog.filter((p) => p.categoryIds.some((c) => cats.includes(c))).map((p) => p.id),
      )
      scopedLines = lines.filter((l) => scopedIds.has(l.product.id))
    }
  }
  const scopedSubtotal = scopedLines.reduce(
    (s, l) => s + l.lineTotal,
    0,
  )
  if (scopedLines.length === 0 && coupon.type !== "FREE_SHIPPING") {
    return { ok: false, reason: "Ce code promo ne s'applique à aucun article de votre panier." }
  }

  const base = coupon.type === "FREE_SHIPPING" ? subtotalAfterPromotions : scopedSubtotal
  if (coupon.minOrderAmount > 0 && base < coupon.minOrderAmount) {
    return {
      ok: false,
      reason: `Montant minimum de ${coupon.minOrderAmount} FCFA requis pour ce code promo.`,
    }
  }

  const application: CouponApplication = {
    couponId: coupon.id,
    code: coupon.code,
    type: coupon.type,
    amount: 0,
    description: "",
    freeShipping: false,
    freeLine: null,
  }

  switch (coupon.type) {
    case "PERCENT": {
      application.amount = percentOf(base, coupon.value)
      application.description = `Code ${coupon.code} : -${coupon.value} %`
      break
    }
    case "FIXED": {
      application.amount = Math.min(coupon.value, base)
      application.description = `Code ${coupon.code} : réduction fixe`
      break
    }
    case "FREE_SHIPPING": {
      application.freeShipping = true
      application.description = `Code ${coupon.code} : livraison offerte`
      break
    }
    case "FREE_PRODUCT": {
      if (!coupon.freeProductId) return { ok: false, reason: "Ce code promo est mal configuré (produit offert manquant)." }
      // Produit offert : catalogue en cache d'abord, lecture fraîche en repli
      const catalogProduct = (await getCatalog()).find((p) => p.id === coupon.freeProductId) ?? null
      const freeProduct =
        catalogProduct ??
        (await db.product.findFirst({
          where: { id: coupon.freeProductId, status: "ACTIVE", deletedAt: null },
        }))
      if (!freeProduct) return { ok: false, reason: "Le produit offert est indisponible." }
      if (freeProduct.type !== "DIGITAL" && freeProduct.stock < 1) {
        return { ok: false, reason: "Le produit offert est en rupture de stock." }
      }
      application.amount = freeProduct.salePrice ?? freeProduct.price
      application.freeLine = {
        productId: freeProduct.id,
        productName: freeProduct.name,
        productSlug: freeProduct.slug,
        sku: freeProduct.sku,
        unitPrice: application.amount,
        quantity: 1,
        message: `Offert par le code ${coupon.code}`,
      }
      application.description = `Code ${coupon.code} : ${freeProduct.name} offert`
      break
    }
    default:
      return { ok: false, reason: "Type de code promo inconnu." }
  }

  return { ok: true, coupon: application }
}
