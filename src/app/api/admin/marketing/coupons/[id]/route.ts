import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"
import { partialCouponSchema } from "../../_lib/schemas"

/**
 * PATCH /api/admin/marketing/coupons/[id] — modification complète (aussi utilisée
 *   pour activer/désactiver via { isActive }).
 * DELETE /api/admin/marketing/coupons/[id] — refusée si le code a été utilisé :
 *   proposer l'archivage (isActive=false) pour préserver l'historique comptable.
 */

const idSchema = z.string().min(1)
const partialCoupon = partialCouponSchema

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await requireStaff("coupons.manage")
    const { id } = await params
    const couponId = idSchema.parse(id)

    const coupon = await db.coupon.findUnique({ where: { id: couponId } })
    if (!coupon) throw new ApiError("Code promo introuvable.", 404)

    const body = await parseBody(request, partialCoupon)

    // Changement de code : vérifier l'unicité
    if (body.code && body.code !== coupon.code) {
      const existing = await db.coupon.findUnique({ where: { code: body.code } })
      if (existing) {
        throw new ApiError(`Le code « ${body.code} » est déjà utilisé.`, 409)
      }
    }

    const updated = await db.coupon.update({
      where: { id: couponId },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.value !== undefined ? { value: body.value } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        ...(body.appliesTo !== undefined ? { appliesTo: body.appliesTo } : {}),
        ...(body.productIds !== undefined ? { productIdsJson: JSON.stringify(body.productIds) } : {}),
        ...(body.categoryIds !== undefined ? { categoryIdsJson: JSON.stringify(body.categoryIds) } : {}),
        ...(body.minOrderAmount !== undefined ? { minOrderAmount: body.minOrderAmount } : {}),
        ...(body.maxUses !== undefined ? { maxUses: body.maxUses } : {}),
        ...(body.perCustomerLimit !== undefined ? { perCustomerLimit: body.perCustomerLimit } : {}),
        ...(body.freeProductId !== undefined ? { freeProductId: body.freeProductId ?? null } : {}),
        ...(body.startsAt !== undefined ? { startsAt: body.startsAt } : {}),
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.userId !== undefined ? { userId: body.userId ?? null } : {}),
      },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: body.isActive === undefined ? "coupon.update" : "coupon.toggle_active",
      entityType: "coupon",
      entityId: couponId,
      details: {
        code: updated.code,
        ...(body.isActive !== undefined ? { actif: updated.isActive } : {}),
      },
    })

    // Purge du cache lecture panier (ancien ET nouveau code)
    invalidateCache("catalog:coupon:")
    invalidateCache("admin:marketing")

    return ok({ id: updated.id, code: updated.code, isActive: updated.isActive })
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireStaff("coupons.manage")
    const { id } = await params
    const couponId = idSchema.parse(id)

    const coupon = await db.coupon.findUnique({
      where: { id: couponId },
      include: { _count: { select: { redemptions: true } } },
    })
    if (!coupon) throw new ApiError("Code promo introuvable.", 404)

    if (coupon.usedCount > 0 || coupon._count.redemptions > 0) {
      throw new ApiError(
        `Impossible de supprimer « ${coupon.code} » : il a déjà été utilisé ${coupon.usedCount} fois. Désactivez-le (archivage) pour conserver l'historique comptable des remises.`,
        409,
        "USED_COUPON",
      )
    }

    await db.coupon.delete({ where: { id: couponId } })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "coupon.delete",
      entityType: "coupon",
      entityId: couponId,
      details: { code: coupon.code },
    })

    invalidateCache("catalog:coupon:")
    invalidateCache("admin:marketing")

    return ok({ id: couponId, deleted: true })
  } catch (error) {
    if (error instanceof ApiError) return fail(error.message, error.status, error.code)
    console.error("[api]", error)
    return fail("Une erreur interne est survenue. Veuillez réessayer.", 500)
  }
}
