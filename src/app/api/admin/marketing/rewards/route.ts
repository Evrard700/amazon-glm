import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { parseJson } from "@/lib/json"
import { processDueRewards } from "@/lib/services/referrals"

/**
 * GET /api/admin/marketing/rewards?program=COMMISSION|FULL_REFUND|ALL
 *
 * Au chargement, les récompenses arrivées à échéance (délai anti-fraude écoulé)
 * passent automatiquement en « Disponible » via processDueRewards() — le seul
 * cycle serveur habilité à créditer un portefeuille.
 */

const querySchema = z.object({
  program: z.enum(["COMMISSION", "FULL_REFUND", "ALL"]).default("ALL"),
})

export async function GET(request: Request) {
  return handle(async () => {
    await requireStaff("rewards.manage")
    const url = new URL(request.url)
    const { program } = querySchema.parse({
      program: url.searchParams.get("program") ?? "ALL",
    })

    // Cycle serveur : mûres → disponibles (jamais de simple UPDATE de solde)
    const processed = await processDueRewards()

    const rewards = await db.reward.findMany({
      where: program === "ALL" ? {} : { program },
      orderBy: { createdAt: "desc" },
      include: {
        beneficiary: { select: { id: true, name: true, email: true, storeCredit: true } },
        sourceOrder: { select: { id: true, orderNumber: true, total: true } },
        approvedBy: { select: { name: true } },
      },
    })

    // Reward ne porte pas de relation sourceUser : résolution manuelle du filleul
    const filleulIds = [...new Set(rewards.map((r) => r.sourceUserId).filter((v): v is string => !!v))]
    const filleulUsers = filleulIds.length
      ? await db.user.findMany({ where: { id: { in: filleulIds } }, select: { id: true, name: true, email: true } })
      : []
    const filleulById = new Map(filleulUsers.map((u) => [u.id, u]))

    return ok({
      processedDue: processed,
      rewards: rewards.map((r) => {
        const snapshot = parseJson<{ rewardMode?: string; programName?: string }>(
          r.ruleSnapshotJson,
          {},
        )
        const filleul = r.sourceUserId ? filleulById.get(r.sourceUserId) : null
        return {
          id: r.id,
          program: r.program,
          programId: r.programId,
          beneficiary: {
            id: r.beneficiary.id,
            name: r.beneficiary.name,
            email: r.beneficiary.email,
          },
          sourceOrder: {
            id: r.sourceOrder.id,
            orderNumber: r.sourceOrder.orderNumber,
            total: r.sourceOrder.total,
          },
          filleul: filleul
            ? { id: filleul.id, name: filleul.name, email: filleul.email }
            : null,
          amount: r.amount,
          status: r.status,
          rewardMode: snapshot.rewardMode ?? "STORE_CREDIT",
          reason: r.reason,
          eligibleAt: r.eligibleAt,
          approvedAt: r.approvedAt,
          approvedByName: r.approvedBy?.name ?? null,
          paidAt: r.paidAt,
          cancelledAt: r.cancelledAt,
          cancelledReason: r.cancelledReason,
          createdAt: r.createdAt,
        }
      }),
    })
  })
}
