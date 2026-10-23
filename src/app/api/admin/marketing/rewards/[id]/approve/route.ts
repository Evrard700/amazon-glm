import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { parseJson } from "@/lib/json"

/**
 * POST /api/admin/marketing/rewards/[id]/approve
 * Approbation anticipée d'une récompense PENDING — reprend EXACTEMENT la
 * transaction du cycle serveur `processDueRewards` :
 *  - STORE_CREDIT : CreditTransaction + user.storeCredit += amount + AVAILABLE ;
 *  - COUPON       : Coupon FIXED 1 utilisation ciblé userId + AVAILABLE ;
 *  - MANUAL       : status APPROVED (paiement réel effectué hors plateforme,
 *                   puis « Marquer comme payée »).
 * Aucune écriture de solde hors transaction : jamais de simple update.
 */

const idSchema = z.string().min(1)

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await requireStaff("rewards.manage")
    const { id } = await params
    const rewardId = idSchema.parse(id)

    const reward = await db.reward.findUnique({
      where: { id: rewardId },
      include: { beneficiary: { select: { id: true, name: true, email: true } } },
    })
    if (!reward) throw new ApiError("Récompense introuvable.", 404)
    if (reward.status !== "REWARD_PENDING") {
      throw new ApiError(
        "Seule une récompense en attente de validation peut être approuvée.",
        409,
      )
    }

    const snapshot = parseJson<{ rewardMode?: string }>(reward.ruleSnapshotJson, {})
    const mode = snapshot.rewardMode ?? "STORE_CREDIT"
    const now = new Date()

    let creditBalanceAfter: number | null = null
    let couponCode: string | null = null

    await db.$transaction(async (tx) => {
      if (mode === "STORE_CREDIT") {
        const user = await tx.user.findUniqueOrThrow({ where: { id: reward.beneficiaryId } })
        const balanceAfter = user.storeCredit + reward.amount
        await tx.user.update({ where: { id: user.id }, data: { storeCredit: balanceAfter } })
        await tx.creditTransaction.create({
          data: {
            userId: reward.beneficiaryId,
            amount: reward.amount,
            type: "REWARD",
            description: `${reward.reason} (approbation anticipée)`,
            balanceAfter,
            rewardId: reward.id,
          },
        })
        creditBalanceAfter = balanceAfter
        await tx.reward.update({
          where: { id: reward.id },
          data: { status: "REWARD_AVAILABLE", approvedAt: now, approvedById: actor.id },
        })
      } else if (mode === "COUPON") {
        const code = `MERCI-${reward.id.slice(-8).toUpperCase()}`
        await tx.coupon.create({
          data: {
            code,
            type: "FIXED",
            value: reward.amount,
            description: `Récompense parrainage : ${reward.reason}`,
            perCustomerLimit: 1,
            maxUses: 1,
            userId: reward.beneficiaryId,
            isActive: true,
          },
        })
        couponCode = code
        await tx.reward.update({
          where: { id: reward.id },
          data: { status: "REWARD_AVAILABLE", approvedAt: now, approvedById: actor.id },
        })
      } else {
        // MANUAL : le paiement réel sera effectué hors plateforme
        await tx.reward.update({
          where: { id: reward.id },
          data: { status: "REWARD_APPROVED", approvedAt: now, approvedById: actor.id },
        })
      }
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "reward.approve",
      entityType: "reward",
      entityId: reward.id,
      details: {
        beneficiaire: reward.beneficiary.name,
        montant: reward.amount,
        mode,
        programme: reward.program,
        soldeApres: creditBalanceAfter,
        couponCree: couponCode,
      },
    })

    return ok({
      id: reward.id,
      status: mode === "MANUAL" ? "REWARD_APPROVED" : "REWARD_AVAILABLE",
      mode,
      creditBalanceAfter,
      couponCode,
    })
  })
}
