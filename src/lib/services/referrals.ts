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
  const clean = referralCode.trim().toUpperCase()
  // Lectures indépendantes (clés passées en argument) → 1 salve parallèle
  const [client, referrer] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: clientUserId } }),
    db.user.findUnique({ where: { referralCode: clean } }),
  ])
  if (client.referredById) {
    return { ok: false, reason: "Ce client a déjà un parrain." }
  }
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

/** Ligne de commande minimale pour le calcul d'éligibilité (batch anti-N+1). */
interface EligibleLine {
  productId: string
  lineTotal: number
  isFreeItem: boolean
}

/** Sous-total éligible calculé EN MÉMOIRE sur des lignes préchargées
 *  (reflet EXACT d'eligibleSubtotalOfOrder, sans requête par commande). */
function eligibleSubtotalOfLines(
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

/** Périmètre éligible complet (produits listés ∪ produits des catégories listées)
 *  — 1 seule requête, partagée par tous les calculs du programme. */
async function loadEligibleScope(
  eligibleProductIds: string[],
  eligibleCategoryIds: string[],
): Promise<{ scopedIds: Set<string>; hasScope: boolean }> {
  const hasScope = eligibleProductIds.length > 0 || eligibleCategoryIds.length > 0
  const scopedIds = new Set(eligibleProductIds)
  if (eligibleCategoryIds.length > 0) {
    const links = await db.productCategory.findMany({ where: { categoryId: { in: eligibleCategoryIds } } })
    links.forEach((l) => scopedIds.add(l.productId))
  }
  return { scopedIds, hasScope }
}

/**
 * À appeler UNIQUEMENT après confirmation réelle du paiement.
 * Crée les récompenses de commission (idempotent via uniqueKey).
 */
export async function processCommissionRewardForOrder(orderId: string): Promise<void> {
  // Commande + programme indépendants → 1 salve parallèle
  const [order, program] = await Promise.all([
    db.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    }),
    getReferralProgram(),
  ])
  if (!order || !order.referrerId || !order.userId) return

  if (!program.isActive) return
  const now = Date.now()
  if (program.startsAt && program.startsAt.getTime() > now) return
  if (program.endsAt && program.endsAt.getTime() < now) return
  if (order.paymentStatus !== "PAYMENT_PAID") return // sécurité double

  // Parrain + compteurs de limites en 1 salve parallèle (clé = order.referrerId,
  // connu ici) ; les compteurs ne sont lus QUE si la limite correspondante est définie
  const referrerId = order.referrerId
  const [referrer, rewardsCount, referralsCount] = await Promise.all([
    db.user.findUnique({ where: { id: referrerId } }),
    program.maxRewardsPerReferrer !== null
      ? db.reward.count({
          where: { beneficiaryId: referrerId, program: "COMMISSION", status: { not: "REWARD_CANCELLED" } },
        })
      : Promise.resolve(0),
    program.maxReferralsPerReferrer !== null
      ? db.user.count({ where: { referredById: referrerId } })
      : Promise.resolve(0),
  ])
  if (!referrer) return

  // Limites par parrain
  if (program.maxRewardsPerReferrer !== null && rewardsCount >= program.maxRewardsPerReferrer) return
  if (program.maxReferralsPerReferrer !== null && referralsCount > program.maxReferralsPerReferrer) return

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
  const { scopedIds, hasScope } = await loadEligibleScope(eligibleProductIds, eligibleCategoryIds)

  // Filleuls qualifiés : chacun a ≥ requiredPaidOrdersPerReferral commandes PAYÉES ≥ minOrderAmountPerReferral.
  // BATCH anti-N+1 (même calcul que la boucle d'origine) : 1 lecture des filleuls +
  // 1 lecture de TOUTES les lignes de leurs commandes payées non annulées.
  const filleuls = await db.user.findMany({ where: { referredById: parrainId } })
  let qualified = 0
  if (filleuls.length > 0) {
    const paidItems = await db.orderItem.findMany({
      where: {
        order: { userId: { in: filleuls.map((f) => f.id) }, paymentStatus: "PAYMENT_PAID", orderStatus: { notIn: ["CANCELLED"] } },
      },
      select: { orderId: true, productId: true, lineTotal: true, isFreeItem: true, order: { select: { userId: true } } },
    })
    // filleulId → orderId → lignes (une commande appartient à un seul client)
    const itemsByFilleulByOrder = new Map<string, Map<string, EligibleLine[]>>()
    for (const item of paidItems) {
      const ownerId = item.order.userId
      if (!ownerId) continue
      const perOrder = itemsByFilleulByOrder.get(ownerId) ?? new Map<string, EligibleLine[]>()
      const bucket = perOrder.get(item.orderId) ?? []
      bucket.push({ productId: item.productId, lineTotal: item.lineTotal, isFreeItem: item.isFreeItem })
      perOrder.set(item.orderId, bucket)
      itemsByFilleulByOrder.set(ownerId, perOrder)
    }
    for (const filleul of filleuls) {
      const perOrder = itemsByFilleulByOrder.get(filleul.id) ?? new Map<string, EligibleLine[]>()
      let qualifying = 0
      for (const lines of perOrder.values()) {
        const amount = eligibleSubtotalOfLines(lines, scopedIds, hasScope)
        if (amount >= program.minOrderAmountPerReferral) qualifying++
      }
      if (qualifying >= program.requiredPaidOrdersPerReferral) qualified++
    }
  }
  if (qualified < program.requiredReferrals) return null

  // Commande source éligible du parrain : payée, ≥ minSourceOrderAmount, sans récompense FULL_REFUND existante
  const parrainOrders = await db.order.findMany({
    where: { userId: parrainId, paymentStatus: "PAYMENT_PAID", orderStatus: { notIn: ["CANCELLED", "REFUNDED"] } },
    orderBy: { paidAt: "desc" },
  })
  if (parrainOrders.length > 0) {
    // BATCH : lignes des commandes du parrain + récompenses existantes en 2 requêtes
    // (les uniqueKey "fullrefund:{orderId}:{programId}" sont exactement celles
    // recherchées par l'ancien findUnique par commande)
    const [parrainItems, existingRewards] = await Promise.all([
      db.orderItem.findMany({
        where: { orderId: { in: parrainOrders.map((o) => o.id) } },
        select: { orderId: true, productId: true, lineTotal: true, isFreeItem: true },
      }),
      db.reward.findMany({
        where: { uniqueKey: { in: parrainOrders.map((o) => `fullrefund:${o.id}:${program.id}`) } },
        select: { uniqueKey: true },
      }),
    ])
    const itemsByOrder = new Map<string, EligibleLine[]>()
    for (const item of parrainItems) {
      const bucket = itemsByOrder.get(item.orderId) ?? []
      bucket.push({ productId: item.productId, lineTotal: item.lineTotal, isFreeItem: item.isFreeItem })
      itemsByOrder.set(item.orderId, bucket)
    }
    const existingKeys = new Set(existingRewards.map((r) => r.uniqueKey))

    for (const o of parrainOrders) {
      if (existingKeys.has(`fullrefund:${o.id}:${program.id}`)) continue
      const amount = eligibleSubtotalOfLines(itemsByOrder.get(o.id) ?? [], scopedIds, hasScope)
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
  if (due.length === 0) return 0

  // BATCH : tous les bénéficiaires en 1 lecture (au lieu d'un findUniqueOrThrow
  // par récompense). Le solde est suivi EN MÉMOIRE de façon séquentielle :
  // plusieurs récompenses du même bénéficiaire s'enchaînent avec un balanceAfter
  // exact (reflet des relectures d'origine).
  const beneficiaryIds = [...new Set(due.map((r) => r.beneficiaryId))]
  const beneficiaries = await db.user.findMany({ where: { id: { in: beneficiaryIds } } })
  const userById = new Map(beneficiaries.map((u) => [u.id, u]))
  const balanceByUser = new Map<string, number>()

  let processed = 0
  for (const reward of due) {
    const snap = parseJson<{ rewardMode?: string }>(reward.ruleSnapshotJson, {})
    const mode = snap.rewardMode ?? "STORE_CREDIT"
    await db.$transaction(async (tx) => {
      if (mode === "STORE_CREDIT") {
        const user = userById.get(reward.beneficiaryId)
        if (!user) {
          // Cas impossible (la relation bénéficiaire est une FK Cascade) :
          // reproduit l'échec du findUniqueOrThrow d'origine.
          throw new Error("Bénéficiaire de la récompense introuvable.")
        }
        const currentBalance = balanceByUser.get(user.id) ?? user.storeCredit
        const balanceAfter = currentBalance + reward.amount
        balanceByUser.set(user.id, balanceAfter)
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
  // 1 seul UPDATE global (mêmes filtres que l'ancienne boucle findMany + update par ligne)
  const result = await db.reward.updateMany({
    where: { sourceOrderId: orderId, status: { in: ["REWARD_PENDING", "REWARD_APPROVED"] } },
    data: { status: "REWARD_CANCELLED", cancelledAt: new Date(), cancelledReason: reason },
  })
  return result.count
}
