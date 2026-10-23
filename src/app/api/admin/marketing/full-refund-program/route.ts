import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { getFullRefundProgram } from "@/lib/services/referrals"
import { fullRefundProgramSchema } from "../_lib/schemas"
import { parseScopes } from "../_lib/helpers"

/**
 * GET /api/admin/marketing/full-refund-program — programme + VUE PROGRESSION par
 *   parrain (détail filleul par filleul, commandes sources candidates, récompenses).
 * PATCH /api/admin/marketing/full-refund-program — mise à jour (referrals.manage).
 *
 * Le comptage "filleul qualifié" duplique en lecture seule la logique EXACTE du
 * moteur (`maybeCreateFullRefundRewardForParrain`) : commandes PAYÉES non
 * annulées, sous-total éligible ≥ minOrderAmountPerReferral, périmètre
 * produits/catégories identique.
 *
 * BATCH anti-N+1 : filles, commandes, lignes et récompenses sont chargés en
 * QUELQUES requêtes globales puis regroupés en mémoire (mêmes calculs et
 * mêmes ordres d'affichage que les boucles d'origine).
 */

/** Ligne de commande minimale pour le calcul d'éligibilité. */
interface EligibleLine {
  productId: string
  lineTotal: number
  isFreeItem: boolean
}

/** Résumé minimal d'une commande (vue progression admin). */
interface OrderSummary {
  id: string
  userId: string | null
  orderNumber: string
  paidAt: Date | null
}

/** Sous-total éligible calculé en mémoire (reflet EXACT du helper
 *  eligibleSubtotalOfOrder : tout le panier si aucun périmètre défini,
 *  sinon produits listés ∪ produits des catégories listées). */
function eligibleSubtotalOfItems(
  items: EligibleLine[],
  scopedIds: Set<string>,
  hasScope: boolean,
): number {
  if (!hasScope) {
    return items.filter((i) => !i.isFreeItem).reduce((s, i) => s + i.lineTotal, 0)
  }
  return items
    .filter((i) => !i.isFreeItem && scopedIds.has(i.productId))
    .reduce((s, i) => s + i.lineTotal, 0)
}

export async function GET() {
  return handle(async () => {
    await requireStaff("referrals.manage")
    const program = await getFullRefundProgram()
    const scopes = parseScopes(program.eligibleProductIdsJson, program.eligibleCategoryIdsJson)
    const hasScope = scopes.eligibleProductIds.length > 0 || scopes.eligibleCategoryIds.length > 0

    // Tous les clients ayant au moins un filleul
    const parrains = await db.user.findMany({
      where: { referrals: { some: {} }, role: "CUSTOMER" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, referralCode: true, storeCredit: true },
    })

    type FilleulDetail = {
      filleul: { id: string; name: string; email: string }
      appliedAt: Date | null
      isQualified: boolean
      qualifyingCount: number
      requiredCount: number
      orders: { orderNumber: string; eligibleAmount: number; eligible: boolean; paidAt: Date | null }[]
    }
    type Candidate = {
      orderNumber: string
      eligibleAmount: number
      eligible: boolean
      alreadyRewarded: boolean
      paidAt: Date | null
    }

    const progressions: {
      parrain: { id: string; name: string; email: string; referralCode: string; storeCredit: number }
      qualifiedCount: number
      requiredReferrals: number
      filleuls: FilleulDetail[]
      candidateOrders: Candidate[]
      rewards: unknown[]
    }[] = []

    if (parrains.length > 0) {
      const parrainIds = parrains.map((p) => p.id)

      // ---- BATCH : 1 lecture de TOUS les filleuls (ordre d'origine conservé
      // ---- par regroupement en mémoire) ----
      const allFilleuls = await db.user.findMany({
        where: { referredById: { in: parrainIds } },
        orderBy: [{ referredById: "asc" }, { referralAppliedAt: "asc" }],
      })
      const filleulsByParrain = new Map<string, typeof allFilleuls>()
      for (const f of allFilleuls) {
        const ownerId = f.referredById
        if (!ownerId) continue
        const bucket = filleulsByParrain.get(ownerId) ?? []
        bucket.push(f)
        filleulsByParrain.set(ownerId, bucket)
      }
      const allFilleulIds = allFilleuls.map((f) => f.id)

      // ---- BATCH : commandes payées des filleuls, commandes sources des
      // ---- parrains et récompenses existantes en UNE salve parallèle ----
      const [filleulOrders, sourceOrdersRows, existingRewardRows] = await Promise.all([
        allFilleulIds.length > 0
          ? db.order.findMany({
              where: {
                userId: { in: allFilleulIds },
                paymentStatus: "PAYMENT_PAID",
                orderStatus: { notIn: ["CANCELLED"] },
              },
              orderBy: { paidAt: "desc" },
              select: { id: true, userId: true, orderNumber: true, paidAt: true },
            })
          : Promise.resolve([] as OrderSummary[]),
        db.order.findMany({
          where: {
            userId: { in: parrainIds },
            paymentStatus: "PAYMENT_PAID",
            orderStatus: { notIn: ["CANCELLED", "REFUNDED"] },
          },
          orderBy: { paidAt: "desc" },
          select: { id: true, userId: true, orderNumber: true, paidAt: true },
        }),
        db.reward.findMany({
          where: { program: "FULL_REFUND", beneficiaryId: { in: parrainIds } },
          orderBy: { createdAt: "desc" },
        }),
      ])

      // ---- BATCH : toutes les lignes de ces commandes + périmètre éligible ----
      const allOrderIds = [
        ...new Set([...filleulOrders.map((o) => o.id), ...sourceOrdersRows.map((o) => o.id)]),
      ]
      const [allOrderItems, scopeLinks] = await Promise.all([
        allOrderIds.length > 0
          ? db.orderItem.findMany({
              where: { orderId: { in: allOrderIds } },
              select: { orderId: true, productId: true, lineTotal: true, isFreeItem: true },
            })
          : Promise.resolve([] as { orderId: string; productId: string; lineTotal: number; isFreeItem: boolean }[]),
        scopes.eligibleCategoryIds.length > 0
          ? db.productCategory.findMany({
              where: { categoryId: { in: scopes.eligibleCategoryIds } },
              select: { productId: true },
            })
          : Promise.resolve([] as { productId: string }[]),
      ])
      const itemsByOrder = new Map<string, EligibleLine[]>()
      for (const item of allOrderItems) {
        const bucket = itemsByOrder.get(item.orderId) ?? []
        bucket.push({ productId: item.productId, lineTotal: item.lineTotal, isFreeItem: item.isFreeItem })
        itemsByOrder.set(item.orderId, bucket)
      }
      const scopedIds = new Set(scopes.eligibleProductIds)
      scopeLinks.forEach((l) => scopedIds.add(l.productId))
      const eligibleAmountOf = (orderId: string) =>
        eligibleSubtotalOfItems(itemsByOrder.get(orderId) ?? [], scopedIds, hasScope)

      // Regroupements par propriétaire (les ordres de tri globaux sont conservés
      // à l'intérieur de chaque groupe : paidAt desc / createdAt desc)
      const paidOrdersByFilleul = new Map<string, OrderSummary[]>()
      for (const o of filleulOrders) {
        const ownerId = o.userId
        if (!ownerId) continue
        const bucket = paidOrdersByFilleul.get(ownerId) ?? []
        bucket.push(o)
        paidOrdersByFilleul.set(ownerId, bucket)
      }
      const sourceOrdersByParrain = new Map<string, OrderSummary[]>()
      for (const o of sourceOrdersRows) {
        const ownerId = o.userId
        if (!ownerId) continue
        const bucket = sourceOrdersByParrain.get(ownerId) ?? []
        bucket.push(o)
        sourceOrdersByParrain.set(ownerId, bucket)
      }
      const rewardsByParrain = new Map<string, typeof existingRewardRows>()
      for (const r of existingRewardRows) {
        const bucket = rewardsByParrain.get(r.beneficiaryId) ?? []
        bucket.push(r)
        rewardsByParrain.set(r.beneficiaryId, bucket)
      }

      for (const parrain of parrains) {
        const filleuls = filleulsByParrain.get(parrain.id) ?? []

        let qualified = 0
        const filleulDetails: FilleulDetail[] = []
        for (const filleul of filleuls) {
          const paidOrders = paidOrdersByFilleul.get(filleul.id) ?? []
          const eligibleOrders: { orderNumber: string; eligibleAmount: number; eligible: boolean; paidAt: Date | null }[] = []
          let qualifying = 0
          for (const o of paidOrders) {
            const amount = eligibleAmountOf(o.id)
            const eligible = amount >= program.minOrderAmountPerReferral
            if (eligible) qualifying++
            eligibleOrders.push({
              orderNumber: o.orderNumber,
              eligibleAmount: amount,
              eligible,
              paidAt: o.paidAt,
            })
          }
          const isQualified = qualifying >= program.requiredPaidOrdersPerReferral
          if (isQualified) qualified++
          filleulDetails.push({
            filleul: { id: filleul.id, name: filleul.name, email: filleul.email },
            appliedAt: filleul.referralAppliedAt,
            isQualified,
            qualifyingCount: qualifying,
            requiredCount: program.requiredPaidOrdersPerReferral,
            orders: eligibleOrders,
          })
        }

        // Commandes sources candidates du parrain : payées, ≥ min, non déjà remboursées
        const sourceOrders = sourceOrdersByParrain.get(parrain.id) ?? []
        const existingRewards = rewardsByParrain.get(parrain.id) ?? []
        const rewardedOrderIds = new Set(existingRewards.map((r) => r.sourceOrderId))

        const candidates: Candidate[] = []
        for (const o of sourceOrders) {
          const amount = eligibleAmountOf(o.id)
          candidates.push({
            orderNumber: o.orderNumber,
            eligibleAmount: amount,
            eligible: amount >= program.minSourceOrderAmount,
            alreadyRewarded: rewardedOrderIds.has(o.id),
            paidAt: o.paidAt,
          })
        }

        progressions.push({
          parrain,
          qualifiedCount: qualified,
          requiredReferrals: program.requiredReferrals,
          filleuls: filleulDetails,
          candidateOrders: candidates,
          rewards: existingRewards.map((r) => ({
            id: r.id,
            amount: r.amount,
            status: r.status,
            sourceOrderNumber: sourceOrders.find((o) => o.id === r.sourceOrderId)?.orderNumber ?? null,
            reason: r.reason,
            eligibleAt: r.eligibleAt,
            createdAt: r.createdAt,
          })),
        })
      }
    }

    const allRewards = await db.reward.findMany({
      where: { program: "FULL_REFUND" },
      select: { amount: true, status: true },
    })

    return ok({
      program: {
        id: program.id,
        name: program.name,
        isActive: program.isActive,
        requiredReferrals: program.requiredReferrals,
        requiredPaidOrdersPerReferral: program.requiredPaidOrdersPerReferral,
        minOrderAmountPerReferral: program.minOrderAmountPerReferral,
        eligibleProductIds: scopes.eligibleProductIds,
        eligibleCategoryIds: scopes.eligibleCategoryIds,
        minSourceOrderAmount: program.minSourceOrderAmount,
        refundPercent: program.refundPercent,
        refundCap: program.refundCap,
        maxRewards: program.maxRewards,
        holdPeriodDays: program.holdPeriodDays,
        rewardMode: program.rewardMode,
        terms: program.terms,
        startsAt: program.startsAt,
        endsAt: program.endsAt,
        updatedAt: program.updatedAt,
      },
      stats: {
        parrainsWithReferrals: progressions.length,
        granted: allRewards
          .filter((r) => r.status !== "REWARD_CANCELLED")
          .reduce((s, r) => s + r.amount, 0),
        pending: allRewards
          .filter((r) => r.status === "REWARD_PENDING" || r.status === "REWARD_APPROVED")
          .reduce((s, r) => s + r.amount, 0),
        credited: allRewards
          .filter(
            (r) =>
              r.status === "REWARD_AVAILABLE" ||
              r.status === "REWARD_USED" ||
              r.status === "REWARD_PAID",
          )
          .reduce((s, r) => s + r.amount, 0),
      },
      progressions,
    })
  })
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("referrals.manage")
    const body = await parseBody(request, fullRefundProgramSchema)

    const program = await getFullRefundProgram()
    if (program.id !== 1) throw new ApiError("Programme de remboursement introuvable.", 404)

    const updated = await db.fullRefundProgram.update({
      where: { id: 1 },
      data: {
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.requiredReferrals !== undefined ? { requiredReferrals: body.requiredReferrals } : {}),
        ...(body.requiredPaidOrdersPerReferral !== undefined
          ? { requiredPaidOrdersPerReferral: body.requiredPaidOrdersPerReferral }
          : {}),
        ...(body.minOrderAmountPerReferral !== undefined
          ? { minOrderAmountPerReferral: body.minOrderAmountPerReferral }
          : {}),
        ...(body.eligibleProductIds !== undefined
          ? { eligibleProductIdsJson: JSON.stringify(body.eligibleProductIds) }
          : {}),
        ...(body.eligibleCategoryIds !== undefined
          ? { eligibleCategoryIdsJson: JSON.stringify(body.eligibleCategoryIds) }
          : {}),
        ...(body.minSourceOrderAmount !== undefined
          ? { minSourceOrderAmount: body.minSourceOrderAmount }
          : {}),
        ...(body.refundPercent !== undefined ? { refundPercent: body.refundPercent } : {}),
        ...(body.refundCap !== undefined ? { refundCap: body.refundCap } : {}),
        ...(body.maxRewards !== undefined ? { maxRewards: body.maxRewards } : {}),
        ...(body.holdPeriodDays !== undefined ? { holdPeriodDays: body.holdPeriodDays } : {}),
        ...(body.rewardMode !== undefined ? { rewardMode: body.rewardMode } : {}),
        ...(body.terms !== undefined ? { terms: body.terms ?? null } : {}),
        ...(body.startsAt !== undefined ? { startsAt: body.startsAt } : {}),
        ...(body.endsAt !== undefined ? { endsAt: body.endsAt } : {}),
      },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "full_refund_program.update",
      entityType: "full_refund_program",
      entityId: String(updated.id),
      details: {
        nom: updated.name,
        actif: updated.isActive,
        requis: `${updated.requiredReferrals} filleuls × ${updated.requiredPaidOrdersPerReferral} commande(s)`,
        remboursement: `${updated.refundPercent}% (plafond ${updated.refundCap ?? "aucun"})`,
      },
    })

    return ok({ id: updated.id, updatedAt: updated.updatedAt })
  })
}
