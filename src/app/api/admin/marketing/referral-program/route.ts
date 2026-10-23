import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { getReferralProgram } from "@/lib/services/referrals"
import { referralProgramSchema } from "../_lib/schemas"
import { parseScopes } from "../_lib/helpers"

/**
 * GET /api/admin/marketing/referral-program — programme commission + statistiques
 *   + attributions (filleul ← parrain).
 * PATCH /api/admin/marketing/referral-program — mise à jour (permission referrals.manage).
 */

export async function GET() {
  return handle(async () => {
    await requireStaff("referrals.manage")
    const program = await getReferralProgram()
    const scopes = parseScopes(program.eligibleProductIdsJson, program.eligibleCategoryIdsJson)

    // Statistiques réelles depuis la DB
    const rewards = await db.reward.findMany({
      where: { program: "COMMISSION" },
      select: { amount: true, status: true },
    })
    const granted = rewards
      .filter((r) => r.status !== "REWARD_CANCELLED")
      .reduce((s, r) => s + r.amount, 0)
    const pending = rewards
      .filter((r) => r.status === "REWARD_PENDING" || r.status === "REWARD_APPROVED")
      .reduce((s, r) => s + r.amount, 0)
    const credited = rewards
      .filter(
        (r) =>
          r.status === "REWARD_AVAILABLE" ||
          r.status === "REWARD_USED" ||
          r.status === "REWARD_PAID",
      )
      .reduce((s, r) => s + r.amount, 0)

    // CA généré par les filleuls : commandes payées rattachées à un parrain
    const referredOrders = await db.order.findMany({
      where: {
        referrerId: { not: null },
        paymentStatus: "PAYMENT_PAID",
        orderStatus: { notIn: ["CANCELLED"] },
      },
      select: { subtotal: true, total: true },
    })
    const referredRevenue = referredOrders.reduce((s, o) => s + o.subtotal, 0)

    // Attributions filleul ← parrain
    const referredUsers = await db.user.findMany({
      where: { referredById: { not: null } },
      orderBy: { referralAppliedAt: "asc" },
      include: {
        referredBy: { select: { id: true, name: true, email: true, referralCode: true } },
      },
    })
    type Attribution = {
      filleul: { id: string; name: string; email: string }
      parrain: { id: string; name: string; email: string; referralCode: string } | null
      source: string
      appliedAt: Date | null
      paidOrdersCount: number
      paidTotal: number
    }
    const attributions: Attribution[] = []
    for (const filleul of referredUsers) {
      const paidOrders = await db.order.findMany({
        where: {
          userId: filleul.id,
          paymentStatus: "PAYMENT_PAID",
          orderStatus: { notIn: ["CANCELLED"] },
        },
        select: { total: true },
      })
      attributions.push({
        filleul: { id: filleul.id, name: filleul.name, email: filleul.email },
        parrain: filleul.referredBy
          ? {
              id: filleul.referredBy.id,
              name: filleul.referredBy.name,
              email: filleul.referredBy.email,
              referralCode: filleul.referredBy.referralCode,
            }
          : null,
        source: filleul.referralSource ?? "SIGNUP",
        appliedAt: filleul.referralAppliedAt,
        paidOrdersCount: paidOrders.length,
        paidTotal: paidOrders.reduce((s, o) => s + o.total, 0),
      })
    }

    return ok({
      program: {
        id: program.id,
        name: program.name,
        isActive: program.isActive,
        commissionType: program.commissionType,
        commissionValue: program.commissionValue,
        capPerReward: program.capPerReward,
        baseCalculation: program.baseCalculation,
        minOrderAmount: program.minOrderAmount,
        eligibleProductIds: scopes.eligibleProductIds,
        eligibleCategoryIds: scopes.eligibleCategoryIds,
        maxRewardsPerReferrer: program.maxRewardsPerReferrer,
        maxReferralsPerReferrer: program.maxReferralsPerReferrer,
        holdPeriodDays: program.holdPeriodDays,
        rewardMode: program.rewardMode,
        terms: program.terms,
        startsAt: program.startsAt,
        endsAt: program.endsAt,
        updatedAt: program.updatedAt,
      },
      stats: {
        granted,
        pending,
        credited,
        referredRevenue,
        referrerCount: new Set(
          attributions.filter((a) => a.parrain).map((a) => a.parrain?.id ?? ""),
        ).size,
        referredCount: attributions.length,
        rewardsCount: rewards.length,
      },
      attributions,
    })
  })
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("referrals.manage")
    const body = await parseBody(request, referralProgramSchema)

    const program = await getReferralProgram()
    if (program.id !== 1) throw new ApiError("Programme de parrainage introuvable.", 404)

    const updated = await db.referralProgram.update({
      where: { id: 1 },
      data: {
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.commissionType !== undefined ? { commissionType: body.commissionType } : {}),
        ...(body.commissionValue !== undefined ? { commissionValue: body.commissionValue } : {}),
        ...(body.capPerReward !== undefined ? { capPerReward: body.capPerReward } : {}),
        ...(body.baseCalculation !== undefined ? { baseCalculation: body.baseCalculation } : {}),
        ...(body.minOrderAmount !== undefined ? { minOrderAmount: body.minOrderAmount } : {}),
        ...(body.eligibleProductIds !== undefined
          ? { eligibleProductIdsJson: JSON.stringify(body.eligibleProductIds) }
          : {}),
        ...(body.eligibleCategoryIds !== undefined
          ? { eligibleCategoryIdsJson: JSON.stringify(body.eligibleCategoryIds) }
          : {}),
        ...(body.maxRewardsPerReferrer !== undefined
          ? { maxRewardsPerReferrer: body.maxRewardsPerReferrer }
          : {}),
        ...(body.maxReferralsPerReferrer !== undefined
          ? { maxReferralsPerReferrer: body.maxReferralsPerReferrer }
          : {}),
        ...(body.holdPeriodDays !== undefined ? { holdPeriodDays: body.holdPeriodDays } : {}),
        ...(body.rewardMode !== undefined ? { rewardMode: body.rewardMode } : {}),
        ...(body.terms !== undefined ? { terms: body.terms ?? null } : {}),
        ...(body.startsAt !== undefined ? { startsAt: body.startsAt } : {}),
        ...(body.endsAt !== undefined ? { endsAt: body.endsAt } : {}),
      },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "referral_program.update",
      entityType: "referral_program",
      entityId: String(updated.id),
      details: {
        nom: updated.name,
        actif: updated.isActive,
        commission: `${updated.commissionType} ${updated.commissionValue}`,
      },
    })

    return ok({ id: updated.id, updatedAt: updated.updatedAt })
  })
}
