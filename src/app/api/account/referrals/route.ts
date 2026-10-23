import { db } from "@/lib/db"
import { ok, handle } from "@/lib/api"
import { requireUser } from "@/lib/auth"
import { parseJson } from "@/lib/json"
import { processDueRewards } from "@/lib/services/referrals"

/**
 * PAGE PARRAINAGE CLIENT (GET /api/account/referrals)
 * Agrège tout ce que la page marketing /account/referrals affiche :
 *  - code de parrainage + solde crédit boutique,
 *  - configuration des deux programmes (commission + remboursement intégral),
 *  - filleuls et leur qualification (commandes payées éligibles),
 *  - récompenses du parrain avec leur statut,
 *  - progression vers le remboursement intégral.
 * processDueRewards() est appelé d'abord (lent, mutation idempotente —
 * inchangé) : les récompenses dont le délai anti-fraude est écoulé passent
 * en crédit boutique. TOUT LE RESTE est ensuite chargé en parallèle et
 * les anciennes boucles N+1 (commandes + lignes par filleul) sont
 * regroupées en 2 requêtes globales — mêmes règles de calcul.
 */

/** Sous-total éligible d'une commande selon les produits/catégories du programme
 *  (reflet EXACT du calcul d'origine : tout le panier si aucun périmètre défini,
 *  sinon produits listés ∪ produits des catégories listées). */
function eligibleSubtotalOf(
  items: { productId: string; lineTotal: number; isFreeItem: boolean }[],
  eligibleProductIds: string[],
  links: { productId: string }[],
  hasScope: boolean,
): number {
  if (!hasScope) {
    return items.filter((i) => !i.isFreeItem).reduce((s, i) => s + i.lineTotal, 0)
  }
  const scopedIds = new Set(eligibleProductIds)
  links.forEach((l) => scopedIds.add(l.productId))
  return items.filter((i) => !i.isFreeItem && scopedIds.has(i.productId)).reduce((s, i) => s + i.lineTotal, 0)
}

export async function GET() {
  return handle(async () => {
    const sessionUser = await requireUser()

    // Mûrit les récompenses échues (crédite le portefeuille) avant lecture
    await processDueRewards()

    const [me, commission, fullRefund, filleulsRows, rewards, referredByName] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: sessionUser.id } }),
      db.referralProgram.findUniqueOrThrow({ where: { id: 1 } }),
      db.fullRefundProgram.findUniqueOrThrow({ where: { id: 1 } }),
      db.user.findMany({
        where: { referredById: sessionUser.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, createdAt: true },
      }),
      db.reward.findMany({
        where: { beneficiaryId: sessionUser.id },
        orderBy: { createdAt: "desc" },
        include: { sourceOrder: { select: { orderNumber: true } } },
      }),
      sessionUser.referredById
        ? db.user
            .findUnique({ where: { id: sessionUser.referredById }, select: { name: true } })
            .then((u) => u?.name ?? null)
        : Promise.resolve(null),
    ])

    const commissionProductIds = parseJson<string[]>(commission.eligibleProductIdsJson, [])
    const commissionCategoryIds = parseJson<string[]>(commission.eligibleCategoryIdsJson, [])
    const frpProductIds = parseJson<string[]>(fullRefund.eligibleProductIdsJson, [])
    const frpCategoryIds = parseJson<string[]>(fullRefund.eligibleCategoryIdsJson, [])
    const commissionHasScope = commissionProductIds.length > 0 || commissionCategoryIds.length > 0
    const frpHasScope = frpProductIds.length > 0 || frpCategoryIds.length > 0

    // ---- Filleuls + qualification : 2 requêtes globales en parallèle ----
    // 1. Toutes les lignes des commandes payées (non annulées) des filleuls,
    //    avec l'identifiant du propriétaire de la commande pour regrouper.
    // 2. Les produits des catégories éligibles de chaque programme.
    const filleulIds = filleulsRows.map((f) => f.id)
    const [allOrderItems, commissionLinks, frpLinks] = await Promise.all([
      filleulIds.length > 0
        ? db.orderItem.findMany({
            where: {
              order: {
                userId: { in: filleulIds },
                paymentStatus: "PAYMENT_PAID",
                orderStatus: { not: "CANCELLED" },
              },
            },
            include: { order: { select: { userId: true } } },
          })
        : Promise.resolve([]),
      commissionCategoryIds.length > 0
        ? db.productCategory.findMany({ where: { categoryId: { in: commissionCategoryIds } }, select: { productId: true } })
        : Promise.resolve([] as { productId: string }[]),
      frpCategoryIds.length > 0
        ? db.productCategory.findMany({ where: { categoryId: { in: frpCategoryIds } }, select: { productId: true } })
        : Promise.resolve([] as { productId: string }[]),
    ])

    // Regroupement par filleul puis par commande (l'ordre d'itération
    // d'origine n'influe pas : seules des qualifications booléennes et des
    // dénombrements sont déduits par commande).
    type EligibleItem = { productId: string; lineTotal: number; isFreeItem: boolean }
    const perOrderByFilleul = new Map<string, Map<string, EligibleItem[]>>()
    for (const item of allOrderItems) {
      const ownerId = item.order.userId
      if (!ownerId) continue
      const perOrder = perOrderByFilleul.get(ownerId) ?? new Map<string, EligibleItem[]>()
      const bucket = perOrder.get(item.orderId) ?? []
      bucket.push({ productId: item.productId, lineTotal: item.lineTotal, isFreeItem: item.isFreeItem })
      perOrder.set(item.orderId, bucket)
      perOrderByFilleul.set(ownerId, perOrder)
    }

    let eligibleOrdersCount = 0
    let fullRefundQualified = 0

    const filleuls: {
      id: string
      name: string
      since: string
      commissionPaid: boolean
      frpQualifyingOrders: number
    }[] = []

    for (const f of filleulsRows) {
      const perOrder = perOrderByFilleul.get(f.id) ?? new Map<string, EligibleItem[]>()
      // Chaque commande = son groupe de lignes ; une commande sans ligne
      // (cas impossible en pratique) donne un sous-total de 0, comme avant.
      let commissionPaid = false
      let frpQualifyingOrders = 0
      for (const orderItems of perOrder.values()) {
        const commissionAmount = eligibleSubtotalOf(orderItems, commissionProductIds, commissionLinks, commissionHasScope)
        if (commissionAmount >= commission.minOrderAmount) {
          commissionPaid = true
          eligibleOrdersCount++
        }
        const frpAmount = eligibleSubtotalOf(orderItems, frpProductIds, frpLinks, frpHasScope)
        if (frpAmount >= fullRefund.minOrderAmountPerReferral) frpQualifyingOrders++
      }
      if (frpQualifyingOrders >= fullRefund.requiredPaidOrdersPerReferral) fullRefundQualified++
      filleuls.push({
        id: f.id,
        name: f.name,
        since: f.createdAt.toISOString(),
        commissionPaid,
        frpQualifyingOrders,
      })
    }

    const sumOf = (statuses: string[]) =>
      rewards.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r.amount, 0)

    const rewardDtos = rewards.map((r) => ({
      id: r.id,
      program: r.program,
      amount: r.amount,
      status: r.status,
      reason: r.reason,
      sourceOrderNumber: r.sourceOrder.orderNumber,
      eligibleAt: r.eligibleAt?.toISOString() ?? null,
      usedAt: r.usedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }))

    return ok({
      referralCode: me.referralCode,
      referredBy: referredByName,
      storeCredit: me.storeCredit,
      programs: {
        commission: {
          name: commission.name,
          isActive: commission.isActive,
          commissionType: commission.commissionType,
          commissionValue: commission.commissionValue,
          capPerReward: commission.capPerReward,
          minOrderAmount: commission.minOrderAmount,
          holdPeriodDays: commission.holdPeriodDays,
          rewardMode: commission.rewardMode,
          terms: commission.terms,
        },
        fullRefund: {
          name: fullRefund.name,
          isActive: fullRefund.isActive,
          requiredReferrals: fullRefund.requiredReferrals,
          requiredPaidOrdersPerReferral: fullRefund.requiredPaidOrdersPerReferral,
          minOrderAmountPerReferral: fullRefund.minOrderAmountPerReferral,
          minSourceOrderAmount: fullRefund.minSourceOrderAmount,
          refundPercent: fullRefund.refundPercent,
          refundCap: fullRefund.refundCap,
          holdPeriodDays: fullRefund.holdPeriodDays,
          rewardMode: fullRefund.rewardMode,
          terms: fullRefund.terms,
        },
      },
      stats: {
        filleulsCount: filleuls.length,
        eligibleOrdersCount,
        pendingRewards: sumOf(["REWARD_PENDING", "REWARD_APPROVED"]),
        availableRewards: sumOf(["REWARD_AVAILABLE"]),
        totalEarned: sumOf(["REWARD_AVAILABLE", "REWARD_USED", "REWARD_PAID"]),
      },
      fullRefundProgress: {
        qualified: fullRefundQualified,
        required: fullRefund.requiredReferrals,
      },
      filleuls,
      rewards: rewardDtos,
    })
  })
}
