import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { getFullRefundProgram } from "@/lib/services/referrals"
import { fullRefundProgramSchema } from "../_lib/schemas"
import { parseScopes, eligibleSubtotalOfOrder } from "../_lib/helpers"

/**
 * GET /api/admin/marketing/full-refund-program — programme + VUE PROGRESSION par
 *   parrain (détail filleul par filleul, commandes sources candidates, récompenses).
 * PATCH /api/admin/marketing/full-refund-program — mise à jour (referrals.manage).
 *
 * Le comptage "filleul qualifié" duplique en lecture seule la logique EXACTE du
 * moteur (`maybeCreateFullRefundRewardForParrain`) : commandes PAYÉES non
 * annulées, sous-total éligible ≥ minOrderAmountPerReferral, périmètre
 * produits/catégories identique.
 */
export async function GET() {
  return handle(async () => {
    await requireStaff("referrals.manage")
    const program = await getFullRefundProgram()
    const scopes = parseScopes(program.eligibleProductIdsJson, program.eligibleCategoryIdsJson)

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
    for (const parrain of parrains) {
      const filleuls = await db.user.findMany({
        where: { referredById: parrain.id },
        orderBy: { referralAppliedAt: "asc" },
      })

      let qualified = 0
      const filleulDetails: FilleulDetail[] = []
      for (const filleul of filleuls) {
        const paidOrders = await db.order.findMany({
          where: {
            userId: filleul.id,
            paymentStatus: "PAYMENT_PAID",
            orderStatus: { notIn: ["CANCELLED"] },
          },
          orderBy: { paidAt: "desc" },
        })
        const eligibleOrders: { orderNumber: string; eligibleAmount: number; eligible: boolean; paidAt: Date | null }[] = []
        let qualifying = 0
        for (const o of paidOrders) {
          const amount = await eligibleSubtotalOfOrder(
            o.id,
            scopes.eligibleProductIds,
            scopes.eligibleCategoryIds,
          )
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
      const sourceOrders = await db.order.findMany({
        where: {
          userId: parrain.id,
          paymentStatus: "PAYMENT_PAID",
          orderStatus: { notIn: ["CANCELLED", "REFUNDED"] },
        },
        orderBy: { paidAt: "desc" },
      })
      const existingRewards = await db.reward.findMany({
        where: { program: "FULL_REFUND", beneficiaryId: parrain.id },
        orderBy: { createdAt: "desc" },
      })
      const rewardedOrderIds = new Set(existingRewards.map((r) => r.sourceOrderId))

      const candidates: Candidate[] = []
      for (const o of sourceOrders) {
        const amount = await eligibleSubtotalOfOrder(
          o.id,
          scopes.eligibleProductIds,
          scopes.eligibleCategoryIds,
        )
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
