import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { parseJson } from "@/lib/json"

/**
 * POST /api/admin/marketing/rewards/[id]/mark-paid
 * « Marquer comme payée » — réservé au mode MANUAL : confirme qu'un paiement
 * RÉEL a été effectué hors plateforme (espèces, mobile money, virement).
 * Aucune écriture de portefeuille ici : simple traçabilité + statut REWARD_PAID.
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
      include: { beneficiary: { select: { id: true, name: true } } },
    })
    if (!reward) throw new ApiError("Récompense introuvable.", 404)
    if (reward.status !== "REWARD_APPROVED") {
      throw new ApiError(
        "Seule une récompense validée (mode paiement manuel) peut être marquée comme payée.",
        409,
      )
    }

    const snapshot = parseJson<{ rewardMode?: string }>(reward.ruleSnapshotJson, {})
    const mode = snapshot.rewardMode ?? "STORE_CREDIT"
    if (mode !== "MANUAL") {
      throw new ApiError(
        "Cette récompense n'est pas en mode paiement manuel : elle est déjà créditée (crédit boutique ou coupon).",
        409,
      )
    }

    await db.reward.update({
      where: { id: rewardId },
      data: { status: "REWARD_PAID", paidAt: new Date() },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "reward.mark_paid",
      entityType: "reward",
      entityId: reward.id,
      details: {
        beneficiaire: reward.beneficiary.name,
        montant: reward.amount,
        note: "Paiement manuel effectué hors plateforme, confirmé par l'admin.",
      },
    })

    return ok({ id: rewardId, status: "REWARD_PAID" })
  })
}
