import { z } from "zod"
import { db } from "@/lib/db"
import { fail, ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"
import { partialPromotionSchema } from "../../_lib/schemas"

/**
 * PATCH /api/admin/marketing/promotions/[id] — modification complète.
 * DELETE /api/admin/marketing/promotions/[id] — refusée si utilisée (usedCount > 0)
 *   pour préserver la cohérence des commandes passées : proposer la désactivation.
 */

const idSchema = z.string().min(1)
const partialPromotion = partialPromotionSchema

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await requireStaff("promotions.manage")
    const { id } = await params
    const promotionId = idSchema.parse(id)

    const promotion = await db.promotion.findUnique({ where: { id: promotionId } })
    if (!promotion) throw new ApiError("Promotion introuvable.", 404)

    const body = await parseBody(request, partialPromotion)

    const updated = await db.promotion.update({
      where: { id: promotionId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        ...(body.ruleType !== undefined ? { ruleType: body.ruleType } : {}),
        ...(body.requiredQty !== undefined ? { requiredQty: body.requiredQty } : {}),
        ...(body.rewardQty !== undefined ? { rewardQty: body.rewardQty } : {}),
        ...(body.rewardProductId !== undefined ? { rewardProductId: body.rewardProductId ?? null } : {}),
        ...(body.discountPercent !== undefined ? { discountPercent: body.discountPercent ?? null } : {}),
        ...(body.appliesTo !== undefined ? { appliesTo: body.appliesTo } : {}),
        ...(body.productIds !== undefined ? { productIdsJson: JSON.stringify(body.productIds) } : {}),
        ...(body.categoryIds !== undefined ? { categoryIdsJson: JSON.stringify(body.categoryIds) } : {}),
        ...(body.minOrderAmount !== undefined ? { minOrderAmount: body.minOrderAmount } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.combinable !== undefined ? { combinable: body.combinable } : {}),
        ...(body.maxUses !== undefined ? { maxUses: body.maxUses } : {}),
        ...(body.perCustomerLimit !== undefined ? { perCustomerLimit: body.perCustomerLimit } : {}),
        ...(body.badgeLabel !== undefined ? { badgeLabel: body.badgeLabel ?? null } : {}),
        ...(body.startsAt !== undefined ? { startsAt: body.startsAt } : {}),
        ...(body.endsAt !== undefined ? { endsAt: body.endsAt } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: body.isActive === undefined ? "promotion.update" : "promotion.toggle_active",
      entityType: "promotion",
      entityId: promotionId,
      details: {
        nom: updated.name,
        ...(body.isActive !== undefined ? { active: updated.isActive } : {}),
      },
    })

    // Liste des promotions actives lue par computeCart via cache
    invalidateCache("promotions:")

    return ok({ id: updated.id, isActive: updated.isActive })
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireStaff("promotions.manage")
    const { id } = await params
    const promotionId = idSchema.parse(id)

    const promotion = await db.promotion.findUnique({ where: { id: promotionId } })
    if (!promotion) throw new ApiError("Promotion introuvable.", 404)

    if (promotion.usedCount > 0) {
      throw new ApiError(
        `Impossible de supprimer « ${promotion.name} » : elle a déjà été appliquée ${promotion.usedCount} fois. Désactivez-la pour conserver la cohérence des commandes passées.`,
        409,
        "USED_PROMOTION",
      )
    }

    await db.promotion.delete({ where: { id: promotionId } })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "promotion.delete",
      entityType: "promotion",
      entityId: promotionId,
      details: { nom: promotion.name },
    })

    // Liste des promotions actives lue par computeCart via cache
    invalidateCache("promotions:")

    return ok({ id: promotionId, deleted: true })
  } catch (error) {
    if (error instanceof ApiError) return fail(error.message, error.status, error.code)
    console.error("[api]", error)
    return fail("Une erreur interne est survenue. Veuillez réessayer.", 500)
  }
}
