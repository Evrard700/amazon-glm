import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"
import { parseJson } from "@/lib/json"
import { promotionSchema } from "../_lib/schemas"

/**
 * GET /api/admin/marketing/promotions — liste BXGY + statistiques.
 * POST /api/admin/marketing/promotions — création (permission promotions.manage).
 */

export async function GET() {
  return handle(async () => {
    await requireStaff("promotions.manage")

    const promotions = await db.promotion.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    })

    // Réduction totale générée (approximation honnête) : somme des montants
    // enregistrés dans le snapshot promotionsJson des commandes.
    const orders = await db.order.findMany({ select: { promotionsJson: true } })
    let totalGenerated = 0
    let totalUses = 0
    for (const o of orders) {
      const apps = parseJson<{ amount?: number }[]>(o.promotionsJson, [])
      for (const a of apps) totalGenerated += Math.round(a.amount ?? 0)
    }
    for (const p of promotions) totalUses += p.usedCount

    const now = Date.now()
    const activePromotions = promotions.filter(
      (p) =>
        p.isActive &&
        (!p.startsAt || p.startsAt.getTime() <= now) &&
        (!p.endsAt || p.endsAt.getTime() >= now),
    ).length

    return ok({
      stats: {
        activeCount: activePromotions,
        totalUses,
        totalGenerated,
      },
      promotions: promotions.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        ruleType: p.ruleType,
        requiredQty: p.requiredQty,
        rewardQty: p.rewardQty,
        rewardProductId: p.rewardProductId,
        discountPercent: p.discountPercent,
        appliesTo: p.appliesTo,
        productIds: parseJson<string[]>(p.productIdsJson, []),
        categoryIds: parseJson<string[]>(p.categoryIdsJson, []),
        minOrderAmount: p.minOrderAmount,
        priority: p.priority,
        combinable: p.combinable,
        maxUses: p.maxUses,
        usedCount: p.usedCount,
        perCustomerLimit: p.perCustomerLimit,
        badgeLabel: p.badgeLabel,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        isActive: p.isActive,
        createdAt: p.createdAt,
      })),
    })
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("promotions.manage")
    const body = await parseBody(request, promotionSchema)

    const promotion = await db.promotion.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        ruleType: body.ruleType,
        requiredQty: body.requiredQty,
        rewardQty: body.rewardQty,
        rewardProductId: body.rewardProductId ?? null,
        discountPercent: body.discountPercent ?? null,
        appliesTo: body.appliesTo,
        productIdsJson: JSON.stringify(body.productIds),
        categoryIdsJson: JSON.stringify(body.categoryIds),
        minOrderAmount: body.minOrderAmount,
        priority: body.priority,
        combinable: body.combinable,
        maxUses: body.maxUses,
        perCustomerLimit: body.perCustomerLimit,
        badgeLabel: body.badgeLabel ?? null,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        isActive: body.isActive,
      },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "promotion.create",
      entityType: "promotion",
      entityId: promotion.id,
      details: { nom: promotion.name, regle: promotion.ruleType },
    })

    // Liste des promotions actives lue par computeCart via cache
    invalidateCache("promotions:")

    return ok({ id: promotion.id }, 201)
  })
}
