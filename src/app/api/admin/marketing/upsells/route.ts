import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { parseJson } from "@/lib/json"
import { upsellSchema } from "../_lib/schemas"

/**
 * GET /api/admin/marketing/upsells — offres + statistiques (acceptations,
 *   taux ≈ acceptations/commandes éligibles, CA additionnel) + historique
 *   des acceptations avec commandes liées.
 * POST /api/admin/marketing/upsells — création (permission upsells.manage).
 */

export async function GET() {
  return handle(async () => {
    await requireStaff("upsells.manage")

    const offers = await db.upsellOffer.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    })
    const acceptances = await db.upsellAcceptance.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        offer: { select: { id: true, name: true } },
        order: { select: { id: true, orderNumber: true, customerName: true, customerEmail: true } },
      },
    })

    // Le modèle UpsellAcceptance ne porte pas de relation user : résolution manuelle
    const acceptanceUserIds = [...new Set(acceptances.map((a) => a.userId).filter((v): v is string => !!v))]
    const acceptanceUsers = acceptanceUserIds.length
      ? await db.user.findMany({ where: { id: { in: acceptanceUserIds } }, select: { id: true, name: true, email: true } })
      : []
    const userById = new Map(acceptanceUsers.map((u) => [u.id, u]))

    // Commandes éligibles par offre (approximation honnête du taux d'acceptation :
    // même définition de déclencheur que le moteur `eligibleUpsellsForOrder`)
    const allOrders = await db.order.findMany({
      where: { orderStatus: { notIn: ["CANCELLED"] }, upsellParentOrderId: null },
      include: { items: { select: { productId: true } } },
    })
    const links = await db.productCategory.findMany()
    const productsByCategory = new Map<string, Set<string>>()
    for (const l of links) {
      if (!productsByCategory.has(l.categoryId)) productsByCategory.set(l.categoryId, new Set())
      productsByCategory.get(l.categoryId)!.add(l.productId)
    }

    let eligibleTotal = 0
    const eligibleByOffer = new Map<string, number>()
    for (const offer of offers) {
      const triggerProducts = parseJson<string[]>(offer.triggerProductIdsJson, [])
      const triggerCategories = parseJson<string[]>(offer.triggerCategoryIdsJson, [])
      let count = 0
      for (const order of allOrders) {
        let matches = false
        if (offer.triggerType === "PRODUCT") {
          matches = order.items.some((i) => triggerProducts.includes(i.productId))
        } else if (offer.triggerType === "CATEGORY") {
          const scoped = new Set<string>()
          for (const c of triggerCategories) {
            productsByCategory.get(c)?.forEach((p) => scoped.add(p))
          }
          matches = order.items.some((i) => scoped.has(i.productId))
        } else {
          matches = order.subtotal >= offer.triggerMinAmount
        }
        // Ne pas compter les commandes contenant déjà le produit proposé
        if (matches && !order.items.some((i) => i.productId === offer.offerProductId)) count++
      }
      eligibleByOffer.set(offer.id, count)
      eligibleTotal += count
    }

    const now = Date.now()
    const activeCount = offers.filter(
      (o) =>
        o.isActive &&
        (!o.startsAt || o.startsAt.getTime() <= now) &&
        (!o.endsAt || o.endsAt.getTime() >= now),
    ).length
    const totalAccepts = acceptances.length
    const additionalRevenue = acceptances.reduce((s, a) => s + a.acceptedPrice, 0)

    // Détail des commandes complémentaires (n°) pour l'historique
    const complementaries = await db.order.findMany({
      where: { id: { in: acceptances.map((a) => a.complementaryOrderId).filter((v): v is string => !!v) } },
      select: { id: true, orderNumber: true },
    })
    const childNumberById = new Map(complementaries.map((c) => [c.id, c.orderNumber]))

    const offerProducts = await db.product.findMany({
      where: { id: { in: [...new Set(offers.map((o) => o.offerProductId))] } },
      select: { id: true, name: true, price: true, salePrice: true, imagesJson: true, type: true, stock: true },
    })
    const productById = new Map(offerProducts.map((p) => [p.id, p]))

    return ok({
      stats: {
        activeCount,
        totalAccepts,
        acceptanceRate: eligibleTotal > 0 ? Math.round((totalAccepts / eligibleTotal) * 100) : null,
        additionalRevenue,
      },
      offers: offers.map((o) => {
        const product = productById.get(o.offerProductId)
        return {
          id: o.id,
          name: o.name,
          triggerType: o.triggerType,
          triggerProductIds: parseJson<string[]>(o.triggerProductIdsJson, []),
          triggerCategoryIds: parseJson<string[]>(o.triggerCategoryIdsJson, []),
          triggerMinAmount: o.triggerMinAmount,
          offerProductId: o.offerProductId,
          offerProduct: product
            ? {
                id: product.id,
                name: product.name,
                normalPrice: product.salePrice ?? product.price,
                image: parseJson<string[]>(product.imagesJson, [])[0] ?? null,
                type: product.type,
                stock: product.stock,
              }
            : null,
          specialPrice: o.specialPrice,
          message: o.message,
          imageUrl: o.imageUrl,
          startsAt: o.startsAt,
          endsAt: o.endsAt,
          isActive: o.isActive,
          maxAccepts: o.maxAccepts,
          acceptedCount: o.acceptedCount,
          showOnThankYou: o.showOnThankYou,
          showInCart: o.showInCart,
          position: o.position,
          eligibleOrders: eligibleByOffer.get(o.id) ?? 0,
          createdAt: o.createdAt,
        }
      }),
      acceptances: acceptances.map((a) => ({
        id: a.id,
        offerName: a.offer.name,
        orderNumber: a.order.orderNumber,
        complementaryOrderNumber: a.complementaryOrderId
          ? childNumberById.get(a.complementaryOrderId) ?? null
          : null,
        customer: a.userId && userById.get(a.userId)
          ? { name: userById.get(a.userId)!.name, email: userById.get(a.userId)!.email }
          : { name: a.order.customerName, email: a.order.customerEmail },
        acceptedPrice: a.acceptedPrice,
        createdAt: a.createdAt,
      })),
    })
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("upsells.manage")
    const body = await parseBody(request, upsellSchema)

    // Cohérence financière : le prix spécial doit être inférieur au prix courant du produit
    const product = await db.product.findFirst({
      where: { id: body.offerProductId, deletedAt: null },
    })
    if (!product) throw new ApiError("Produit proposé introuvable.", 404)
    const normalPrice = product.salePrice ?? product.price
    if (body.specialPrice >= normalPrice) {
      throw new ApiError(
        `Le prix spécial doit être inférieur au prix normal du produit pour que l'offre ait un intérêt.`,
        422,
      )
    }

    const offer = await db.upsellOffer.create({
      data: {
        name: body.name,
        triggerType: body.triggerType,
        triggerProductIdsJson: JSON.stringify(body.triggerProductIds),
        triggerCategoryIdsJson: JSON.stringify(body.triggerCategoryIds),
        triggerMinAmount: body.triggerMinAmount,
        offerProductId: body.offerProductId,
        specialPrice: body.specialPrice,
        message: body.message,
        imageUrl: body.imageUrl ?? null,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        isActive: body.isActive,
        maxAccepts: body.maxAccepts,
        showOnThankYou: body.showOnThankYou,
        showInCart: body.showInCart,
        position: body.position,
      },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "upsell.create",
      entityType: "upsell_offer",
      entityId: offer.id,
      details: {
        nom: offer.name,
        declencheur: offer.triggerType,
        produitPropose: product.name,
        prixSpecial: offer.specialPrice,
      },
    })

    return ok({ id: offer.id }, 201)
  })
}
