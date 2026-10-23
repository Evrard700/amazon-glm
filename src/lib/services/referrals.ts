import { db } from "@/lib/db"
import { parseJson } from "@/lib/json"
import { percentOf } from "@/lib/money"
import { formatXOF } from "@/lib/money"

/**
 * PARRAINAGE — deux programmes distincts :
 * 1. COMMISSION : le parrain gagne une commission sur chaque commande payée de ses filleuls.
 * 2. FULL_REFUND : le parrain récupère jusqu'à 100% de SA commande éligible quand
 *    `requiredReferrals` filleuls ont chacun payé `requiredPaidOrdersPerReferral` commandes admissibles.
 *
 * Règles anti-fraude :
 * - un client n'a qu'UN seul parrain (User.referredById, unique) ;
 * - auto-parrainage impossible (vérifié à l'attribution) ;
 * - idempotence absolue via Reward.uniqueKey ;
 * - seules les commandes PAYÉE comptent (paymentStatus === PAYMENT_PAID) ;
 * - une commande annulée/remboursée suspend/annule la récompense associée.
 */

export async function getReferralProgram() {
  return db.referralProgram.findUniqueOrThrow({ where: { id: 1 } })
}

export async function getFullRefundProgram() {
  return db.fullRefundProgram.findUniqueOrThrow({ where: { id: 1 } })
}

/** Attribue un parrain à un client (inscription ou checkout). Anti-fraude inclus. */
export async function attachReferrer(
  clientUserId: string,
  referralCode: string,
  source: "SIGNUP" | "CHECKOUT",
): Promise<{ ok: true; referrerName: string } | { ok: false; reason: string }> {
  const client = await db.user.findUniqueOrThrow({ where: { id: clientUserId } })
  if (client.referredById) {
    return { ok: false, reason: "Ce client a déjà un parrain." }
  }
  const clean = referralCode.trim().toUpperCase()
  const referrer = await db.user.findUnique({ where: { referralCode: clean } })
  if (!referrer) return { ok: false, reason: "Ce code de parrainage n'existe pas." }
  if (referrer.id === clientUserId) return { ok: false, reason: "Vous ne pouvez pas utiliser votre propre code de parrainage." }
  if (referrer.role !== "CUSTOMER" && referrer.role !== "OWNER") {
    return { ok: false, reason: "Ce code de parrainage n'est pas éligible." }
  }

  const result = await db.user.update({
    where: { id: clientUserId },
    data: {
      referredById: referrer.id,
      referralSource: source,
      referralAppliedAt: new Date(),
    },
  }).catch(() => null)

  if (!result) return { ok: false, reason: "L'attribution du parrainage a échoué (déjà parrainé ?)." }
  return { ok: true, referrerName: referrer.name }
}

/** Sous-total éligible d'une commande selon les produits/catégories d'un programme. */
async function eligibleSubtotalOfOrder(
  orderId: string,
  eligibleProductIds: string[],
  eligibleCategoryIds: string[],
): Promise<number> {
  const items = await db.orderItem.findMany({ where: { orderId } })
  if (eligibleProductIds.length === 0 && eligibleCategoryIds.length === 0) {
    return items.filter((i) => !i.isFreeItem).reduce((s, i) => s + i.lineTotal, 0)
  }
  const scopedIds = new Set(eligibleProductIds)
  if (eligibleCategoryIds.length > 0) {
    const links = await db.productCategory.findMany({ where: { categoryId: { in: eligibleCategoryIds } } })
    links.forEach((l) => scopedIds.add(l.productId))
  }
  return items.filter((i) => !i.isFreeItem && scopedIds.has(i.productId)).reduce((s, i) => s + i.lineTotal, 0)
}

/**
 * À appeler UNIQUEMENT après confirmation réelle du paiement.
 * Crée les récompenses de commission (idempotent via uniqueKey).
 */
export async function processCommissionRewardForOrder(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order || !order.referrerId || !order.userId) return

  const program = await getReferralProgram()
  if (!program.isActive) return
  const now = Date.now()
  if (program.startsAt && program.startsAt.getTime() > now) return
  if (program.endsAt && program.endsAt.getTime() < now) return
  if (order.paymentStatus !== "PAYMENT_PAID") return // sécurité double

  const referrer = await db.user.findUnique({ where: { id: order.referrerId } })
  if (!referrer) return

  // Limites par parrain
  if (program.maxRewardsPerReferrer !== null) {
    const count = await db.reward.count({
      where: { beneficiaryId: referrer.id, program: "COMMISSION", status: { not: "REWARD_CANCELLED" } },
    })
    if (count >= program.maxRewardsPerReferrer) return
  }
  if (program.maxReferralsPerReferrer !== null) {
    const count = await db.user.count({ where: { referredById: referrer.id } })
    if (count > program.maxReferralsPerReferrer) return
  }

  const eligibleAmount = await eligibleSubtotalOfOrder(
    order.id,
    parseJson<string[]>(program.eligibleProductIdsJson, []),
    parseJson<string[]>(program.eligibleCategoryIdsJson, []),
  )
  if (eligibleAmount < program.minOrderAmount) return

  const base = program.baseCalculation === "SUBTOTAL" ? eligibleAmount : eligibleAmount
  const raw = program.commissionType === "PERCENT" ? percentOf(base, program.commissionValue) : program.commissionValue
  const amount = program.capPerReward !== null ? Math.min(raw, program.capPerReward) : raw
  if (amount <= 0) return

  const eligibleAt = new Date(Date.now() + program.holdPeriodDays * 24 * 60 * 60 * 1000)

  await db.reward.upsert({
    where: { uniqueKey: `commission:${order.id}` },
    update: {}, // idempotent : ne rien faire si déjà créée
    create: {
      program: "COMMISSION",
      programId: program.id,
      beneficiaryId: referrer.id,
      sourceOrderId: order.id,
      sourceUserId: order.userId,
      amount,
      status: "REWARD_PENDING",
      uniqueKey: `commission:${order.id}`,
      ruleSnapshotJson: JSON.stringify({
        commissionType: program.commissionType,
        commissionValue: program.commissionValue,
        capPerReward: program.capPerReward,
        minOrderAmount: program.minOrderAmount,
        holdPeriodDays: program.holdPeriodDays,
        rewardMode: program.rewardMode,
        programName: program.name,
      }),
      reason: `Commission parrainage : ${formatXOF(amount)} sur la commande ${order.orderNumber} de ${order.customerName}.`,
      eligibleAt,
    },
  })
}

/**
 * Programme remboursement intégral : vérifie si le CLIENT (parrain) vient d'atteindre
 * le seuil de filleuls qualifiés, et si sa commande éligible peut être remboursée.
 */
export async function processFullRefundRewardForOrder(orderId: string): Promise<void> {
  const filleulOrder = await db.order.findUnique({ where: { id: orderId } })
  if (!filleulOrder || !filleulOrder.userId) return
  const filleul = await db.user.findUnique({ where: { id: filleulOrder.userId } })
  if (!filleul || !filleul.referredById) return
  await maybeCreateFullRefundRewardForParrain(filleul.referredById)
}

/** Vérifie l'éligibilité du parrain au remboursement intégral (cœur du programme 3). */
export async function maybeCreateFullRefundRewardForParrain(parrainId: string): Promise<string | null> {
  const program = await getFullRefundProgram()
  if (!program.isActive) return null
  const now = Date.now()
  if (program.startsAt && program.startsAt.getTime() > now) return null
  if (program.endsAt && program.endsAt.getTime() < now) return null
  if (program.maxRewards !== null) {
    const count = await db.reward.count({ where: { program: "FULL_REFUND", status: { not: "REWARD_CANCELLED" } } })
    if (count >= program.maxRewards) return null
  }

  const eligibleProductIds = parseJson<string[]>(program.eligibleProductIdsJson, [])
  const eligibleCategoryIds = parseJson<string[]>(program.eligibleCategoryIdsJson, [])

  // Filleuls qualifiés : chacun a ≥ requiredPaidOrdersPerReferral commandes PAYÉES ≥ minOrderAmountPerReferral
  const filleuls = await db.user.findMany({ where: { referredById: parrainId } })
  let qualified = 0
  for (const filleul of filleuls) {
    const paidOrders = await db.order.findMany({
      where: { userId: filleul.id, paymentStatus: "PAYMENT_PAID", orderStatus: { notIn: ["CANCELLED"] } },
    })
    let qualifying = 0
    for (const o of paidOrders) {
      const amount = await eligibleSubtotalOfOrder(o.id, eligibleProductIds, eligibleCategoryIds)
      if (amount >= program.minOrderAmountPerReferral) qualifying++
    }
    if (qualifying >= program.requiredPaidOrdersPerReferral) qualified++
  }
  if (qualified < program.requiredReferrals) return null

  // Commande source éligible du parrain : payée, ≥ minSourceOrderAmount, sans récompense FULL_REFUND existante
  const parrainOrders = await db.order.findMany({
    where: { userId: parrainId, paymentStatus: "PAYMENT_PAID", orderStatus: { notIn: ["CANCELLED", "REFUNDED"] } },
    orderBy: { paidAt: "desc" },
  })
  for (const o of parrainOrders) {
    const existing = await db.reward.findUnique({ where: { uniqueKey: `fullrefund:${o.id}:${program.id}` } })
    if (existing) continue
    const amount = await eligibleSubtotalOfOrder(o.id, eligibleProductIds, eligibleCategoryIds)
    if (amount < program.minSourceOrderAmount) continue

    const raw = percentOf(amount, program.refundPercent)
    const refundAmount = program.refundCap !== null ? Math.min(raw, program.refundCap) : raw
    if (refundAmount <= 0) return null

    const eligibleAt = new Date(Date.now() + program.holdPeriodDays * 24 * 60 * 60 * 1000)
    await db.reward.create({
      data: {
        program: "FULL_REFUND",
        programId: program.id,
        beneficiaryId: parrainId,
        sourceOrderId: o.id,
        amount: refundAmount,
        status: "REWARD_PENDING",
        uniqueKey: `fullrefund:${o.id}:${program.id}`,
        ruleSnapshotJson: JSON.stringify({
          requiredReferrals: program.requiredReferrals,
          refundPercent: program.refundPercent,
          refundCap: program.refundCap,
          rewardMode: program.rewardMode,
          programName: program.name,
        }),
        reason: `Remboursement parrainage (${qualified} filleuls qualifiés) : ${formatXOF(refundAmount)} sur la commande ${o.orderNumber}.`,
        eligibleAt,
      },
    })
    return o.id
  }
  return null
}

/**
 * Fait passer les récompenses mûres (délai écoulé) à l'état disponible :
 * crédit boutique, coupon dédié, ou VALIDÉE en attente de paiement manuel.
 * Appelé par le dashboard admin et les pages récompenses (paresseux mais sûr).
 */
export async function processDueRewards(): Promise<number> {
  const due = await db.reward.findMany({
    where: { status: "REWARD_PENDING", eligibleAt: { lte: new Date() } },
    take: 50,
  })
  let processed = 0
  for (const reward of due) {
    const snap = parseJson<{ rewardMode?: string }>(reward.ruleSnapshotJson, {})
    const mode = snap.rewardMode ?? "STORE_CREDIT"
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
            description: reward.reason,
            balanceAfter,
            rewardId: reward.id,
          },
        })
        await tx.reward.update({ where: { id: reward.id }, data: { status: "REWARD_AVAILABLE", approvedAt: new Date() } })
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
        }).catch(() => null)
        await tx.reward.update({ where: { id: reward.id }, data: { status: "REWARD_AVAILABLE", approvedAt: new Date() } })
      } else {
        // MANUAL : validation admin requise avant tout paiement réel
        await tx.reward.update({ where: { id: reward.id }, data: { status: "REWARD_APPROVED" } })
      }
    })
    processed++
  }
  return processed
}

/** Annule/suspend les récompenses liées à une commande annulée ou remboursée. */
export async function cancelRewardsForOrder(orderId: string, reason: string): Promise<number> {
  const rewards = await db.reward.findMany({ where: { sourceOrderId: orderId, status: { in: ["REWARD_PENDING", "REWARD_APPROVED"] } } })
  for (const reward of rewards) {
    await db.reward.update({
      where: { id: reward.id },
      data: { status: "REWARD_CANCELLED", cancelledAt: new Date(), cancelledReason: reason },
    })
  }
  return rewards.length
}
