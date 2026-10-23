import { db } from "@/lib/db"
import { ApiError } from "@/lib/api"
import { parseJson } from "@/lib/json"
import { formatXOF } from "@/lib/money"
import { randomBytes } from "crypto"
import { invalidateCache } from "@/lib/cache"
import { logActivity } from "@/lib/activity"

/**
 * UPSELL — offre complémentaire après commande (page de remerciement) et dans le panier.
 * Règles financières strictes :
 *  - le client accepte EXPLICITEMENT (bouton) ;
 *  - le prix spécial vient de la DB, jamais du navigateur ;
 *  - idempotence : unique(orderId, offerId) — un double clic ne crée qu'une commande ;
 *  - l'acceptation crée une COMMANDE COMPLÉMENTAIRE liée (jamais de débit caché) ;
 *  - pour un paiement déjà effectué en ligne, la commande complémentaire reste
 *    PAYMENT_PENDING (aucun débit automatique sans moyen de paiement réel) ;
 *  - paiement à la livraison : la commande complémentaire suit le même règlement,
 *    sans doublon de frais de livraison (repris de la commande initiale).
 */

export interface EligibleUpsell {
  offerId: string
  name: string
  message: string
  imageUrl: string | null
  product: { id: string; name: string; slug: string; images: string[]; type: string }
  normalPrice: number
  specialPrice: number
  savings: number
  endsAt: string | null
  alreadyAccepted: boolean
}

export async function eligibleUpsellsForOrder(orderId: string): Promise<EligibleUpsell[]> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order) return []

  const offers = await db.upsellOffer.findMany({
    where: { isActive: true, showOnThankYou: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }] },
    orderBy: { position: "asc" },
  })
  if (offers.length === 0) return []

  // --- Préchargement global : 3 requêtes au lieu de 3 par offre (anti-N+1) ---
  // 1) Produits proposés par les offres (mêmes filtres que l'ancien findFirst par offre)
  const offerProductIds = [...new Set(offers.map((o) => o.offerProductId))]
  const products = await db.product.findMany({
    where: { id: { in: offerProductIds }, status: "ACTIVE", deletedAt: null },
  })
  const productById = new Map(products.map((p) => [p.id, p]))

  // 2) Liens produit↔catégorie pour TOUS les déclencheurs CATEGORY confondus
  //    (mêmes données que l'ancien findMany par offre, fusionnées en une requête)
  const allTriggerCategoryIds = [
    ...new Set(
      offers
        .filter((o) => o.triggerType === "CATEGORY")
        .flatMap((o) => parseJson<string[]>(o.triggerCategoryIdsJson, [])),
    ),
  ]
  const categoryLinks = allTriggerCategoryIds.length
    ? await db.productCategory.findMany({ where: { categoryId: { in: allTriggerCategoryIds } } })
    : []
  // categoryId → ensemble des produits liés (union recalculée par offre en mémoire)
  const productIdsByCategoryId = new Map<string, Set<string>>()
  for (const link of categoryLinks) {
    const set = productIdsByCategoryId.get(link.categoryId) ?? new Set<string>()
    set.add(link.productId)
    productIdsByCategoryId.set(link.categoryId, set)
  }

  // 3) Acceptations upsell existantes pour cette commande (idempotence)
  const acceptances = await db.upsellAcceptance.findMany({ where: { orderId }, select: { offerId: true } })
  const acceptedOfferIds = new Set(acceptances.map((a) => a.offerId))

  const results: EligibleUpsell[] = []
  for (const offer of offers) {
    if (offer.maxAccepts !== null && offer.acceptedCount >= offer.maxAccepts) continue

    const product = productById.get(offer.offerProductId)
    if (!product) continue
    if (product.type !== "DIGITAL" && product.trackInventory && product.stock < 1) continue

    // Ciblage
    const triggerProducts = parseJson<string[]>(offer.triggerProductIdsJson, [])
    const triggerCategories = parseJson<string[]>(offer.triggerCategoryIdsJson, [])
    let matches = false
    if (offer.triggerType === "PRODUCT") {
      matches = order.items.some((i) => triggerProducts.includes(i.productId))
    } else if (offer.triggerType === "CATEGORY") {
      const scopedIds = new Set<string>()
      for (const categoryId of triggerCategories) {
        for (const productId of productIdsByCategoryId.get(categoryId) ?? []) scopedIds.add(productId)
      }
      matches = order.items.some((i) => scopedIds.has(i.productId))
    } else if (offer.triggerType === "ORDER_AMOUNT") {
      matches = order.subtotal >= offer.triggerMinAmount
    }
    if (!matches) continue

    // Ne pas reproposer un produit déjà présent dans la commande
    if (order.items.some((i) => i.productId === offer.offerProductId)) continue

    if (acceptedOfferIds.has(offer.id)) continue

    const normalPrice = product.salePrice ?? product.price
    results.push({
      offerId: offer.id,
      name: offer.name,
      message: offer.message,
      imageUrl: offer.imageUrl,
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        images: parseJson<string[]>(product.imagesJson, []),
        type: product.type,
      },
      normalPrice,
      specialPrice: offer.specialPrice,
      savings: Math.max(0, normalPrice - offer.specialPrice),
      endsAt: offer.endsAt?.toISOString() ?? null,
      alreadyAccepted: false,
    })
  }
  return results.slice(0, 3)
}

export async function acceptUpsell(
  offerId: string,
  orderId: string,
  actor: { id: string; name: string } | null,
): Promise<{ orderNumber: string; complementaryOrderId: string }> {
  // Lectures indépendantes (clés passées en argument) → une seule salve parallèle
  const [offer, parent, existing] = await Promise.all([
    db.upsellOffer.findUnique({ where: { id: offerId } }),
    db.order.findUnique({ where: { id: orderId }, include: { items: true } }),
    db.upsellAcceptance.findUnique({ where: { offerId_orderId: { offerId, orderId } } }),
  ])
  if (!offer || !offer.isActive) throw new ApiError("Cette offre n'est plus disponible.", 404)
  const now = new Date()
  if (offer.startsAt && offer.startsAt > now) throw new ApiError("Cette offre n'est pas encore active.", 409)
  if (offer.endsAt && offer.endsAt < now) throw new ApiError("Cette offre a expiré.", 409)
  if (offer.maxAccepts !== null && offer.acceptedCount >= offer.maxAccepts) {
    throw new ApiError("Cette offre a atteint sa limite d'acceptations.", 409)
  }

  if (!parent) throw new ApiError("Commande initiale introuvable.", 404)

  // Idempotence : une même offre ne peut être acceptée qu'une fois pour la commande
  if (existing) {
    const child = existing.complementaryOrderId
      ? await db.order.findUnique({ where: { id: existing.complementaryOrderId } })
      : null
    if (child) return { orderNumber: child.orderNumber, complementaryOrderId: child.id }
    throw new ApiError("Cette offre a déjà été acceptée pour cette commande.", 409)
  }

  const product = await db.product.findFirst({ where: { id: offer.offerProductId, status: "ACTIVE", deletedAt: null } })
  if (!product) throw new ApiError("Produit de l'offre indisponible.", 409)
  if (product.type !== "DIGITAL" && product.trackInventory && product.stock < 1) {
    throw new ApiError("Stock insuffisant pour cette offre.", 409)
  }

  const specialPrice = offer.specialPrice // prix DB, jamais celui du navigateur
  const needsShipping = product.requiresShipping

  const child = await db.$transaction(async (tx) => {
    const acceptance = await tx.upsellAcceptance.create({
      data: { offerId, orderId, userId: parent.userId, acceptedPrice: specialPrice },
    })

    const childOrder = await tx.order.create({
      data: {
        orderNumber: `TM-U-${randomBytes(3).toString("hex").toUpperCase()}`,
        accessToken: randomBytes(16).toString("hex"),
        userId: parent.userId,
        customerName: parent.customerName,
        customerEmail: parent.customerEmail,
        customerPhone: parent.customerPhone,
        address: parent.address,
        city: parent.city,
        shippingZoneId: parent.shippingZoneId,
        shippingZoneName: parent.shippingZoneName,
        shippingCost: needsShipping ? parent.shippingCost : 0, // pas de double frais
        subtotal: specialPrice,
        total: specialPrice + (needsShipping ? parent.shippingCost : 0),
        paymentMethodId: parent.paymentMethodId,
        paymentMethodCode: parent.paymentMethodCode,
        paymentMethodLabel: parent.paymentMethodLabel,
        upsellParentOrderId: parent.id,
        upsellOfferId: offerId,
        orderStatus: "PENDING",
        paymentStatus: "PAYMENT_PENDING",
      },
    })

    await tx.orderItem.create({
      data: {
        orderId: childOrder.id,
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        sku: product.sku,
        unitPrice: specialPrice,
        quantity: 1,
        lineTotal: specialPrice,
      },
    })

    if (product.type !== "DIGITAL" && product.trackInventory) {
      const p = await tx.product.findUniqueOrThrow({ where: { id: product.id } })
      if (p.stock < 1) throw new ApiError("Stock insuffisant pour cette offre.", 409)
      await tx.product.update({ where: { id: product.id }, data: { stock: { decrement: 1 }, salesCount: { increment: 1 } } })
    } else {
      await tx.product.update({ where: { id: product.id }, data: { salesCount: { increment: 1 } } })
    }

    await tx.payment.create({
      data: {
        orderId: childOrder.id,
        provider: parent.paymentMethodCode ?? "cash_on_delivery",
        methodLabel: `${parent.paymentMethodLabel ?? "Paiement"} — offre complémentaire`,
        amount: childOrder.total,
        status: "PAYMENT_PENDING",
      },
    })

    await tx.orderEvent.create({
      data: {
        orderId: childOrder.id,
        type: "created",
        message: `Commande complémentaire (upsell « ${offer.name} ») liée à ${parent.orderNumber}.`,
        actorName: parent.customerName,
      },
    })
    await tx.orderEvent.create({
      data: {
        orderId: parent.id,
        type: "upsell_accepted",
        message: `Offre « ${offer.name} » acceptée : ${product.name} à ${formatXOF(specialPrice)} (commande ${childOrder.orderNumber}).`,
        actorName: parent.customerName,
      },
    })

    await tx.upsellAcceptance.update({
      where: { id: acceptance.id },
      data: { complementaryOrderId: childOrder.id },
    })
    await tx.upsellOffer.update({ where: { id: offerId }, data: { acceptedCount: { increment: 1 } } })

    return childOrder
  })

  await logActivity({
    actor: actor ? { id: actor.id, name: actor.name, role: "CUSTOMER" } : null,
    action: "upsell.accept",
    entityType: "order",
    entityId: child.id,
    details: { offerId, parentOrder: parent.orderNumber, orderNumber: child.orderNumber, price: specialPrice },
  })

  // Stock/salesCount du produit d'offre modifiés en transaction → rafraîchir
  // le catalogue et la fiche produit côté storefront.
  invalidateCache("catalog")
  invalidateCache("product:")

  return { orderNumber: child.orderNumber, complementaryOrderId: child.id }
}
