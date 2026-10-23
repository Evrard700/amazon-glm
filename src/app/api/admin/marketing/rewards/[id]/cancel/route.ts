import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { parseJson } from "@/lib/json"
import { cancelRewardSchema } from "../../../_lib/schemas"

/**
 * POST /api/admin/marketing/rewards/[id]/cancel { reason }
 * Annulation tracée d'une récompense PENDING / APPROVED / AVAILABLE.
 * Intégrité financière : si le portefeuille avait DÉJÀ été crédité (mode
 * STORE_CREDIT + statut AVAILABLE), le crédit est débité dans la même
 * transaction — plancher à 0 FCFA, note explicite conservée.
 */

const idSchema = z.string().min(1)

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await requireStaff("rewards.manage")
    const { id } = await params
    const rewardId = idSchema.parse(id)
    const { reason } = await parseBody(request, cancelRewardSchema)

    const reward = await db.reward.findUnique({
      where: { id: rewardId },
      include: { beneficiary: { select: { id: true, name: true, storeCredit: true } } },
    })
    if (!reward) throw new ApiError("Récompense introuvable.", 404)

    if (!["REWARD_PENDING", "REWARD_APPROVED", "REWARD_AVAILABLE"].includes(reward.status)) {
      throw new ApiError(
        "Cette récompense ne peut plus être annulée (statut actuel : " +
          `${reward.status.replace("REWARD_", "")}).`,
        409,
      )
    }

    const snapshot = parseJson<{ rewardMode?: string }>(reward.ruleSnapshotJson, {})
    const mode = snapshot.rewardMode ?? "STORE_CREDIT"

    let debited: number | null = null
    let creditBalanceAfter: number | null = null
    let couponRevoked: string | null = null
    const wasCredited = reward.status === "REWARD_AVAILABLE"

    await db.$transaction(async (tx) => {
      if (wasCredited && mode === "STORE_CREDIT") {
        // Débit du crédit déjà accordé — plancher 0, note explicite
        const user = await tx.user.findUniqueOrThrow({ where: { id: reward.beneficiaryId } })
        const debit = Math.min(user.storeCredit, reward.amount)
        const balanceAfter = Math.max(0, user.storeCredit - reward.amount)
        await tx.user.update({ where: { id: user.id }, data: { storeCredit: balanceAfter } })
        await tx.creditTransaction.create({
          data: {
            userId: reward.beneficiaryId,
            amount: -debit,
            type: "ADMIN_ADJUSTMENT",
            description: `Annulation récompense parrainage (${reward.reason})${debit < reward.amount ? " — débit plafonné au solde disponible" : ""} : ${reason}`,
            balanceAfter,
            rewardId: reward.id,
            createdById: actor.id,
          },
        })
        debited = debit
        creditBalanceAfter = balanceAfter
      }
      if (wasCredited && mode === "COUPON") {
        // Révoque le coupon dédié généré pour cette récompense
        const code = `MERCI-${reward.id.slice(-8).toUpperCase()}`
        const coupon = await tx.coupon.findUnique({ where: { code } })
        if (coupon && coupon.isActive) {
          await tx.coupon.update({ where: { id: coupon.id }, data: { isActive: false } })
          couponRevoked = code
        }
      }
      await tx.reward.update({
        where: { id: reward.id },
        data: { status: "REWARD_CANCELLED", cancelledAt: new Date(), cancelledReason: reason },
      })
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "reward.cancel",
      entityType: "reward",
      entityId: reward.id,
      details: {
        beneficiaire: reward.beneficiary.name,
        montant: reward.amount,
        raison: reason,
        creditDebite: debited,
        soldeApres: creditBalanceAfter,
        couponRevoque: couponRevoked,
      },
    })

    return ok({
      id: reward.id,
      status: "REWARD_CANCELLED",
      debited,
      creditBalanceAfter,
      couponRevoked,
    })
  })
}
