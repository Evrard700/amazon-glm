import { z } from "zod"
import { db } from "@/lib/db"
import { fail, ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { partialUpsellSchema } from "../../_lib/schemas"

/**
 * PATCH /api/admin/marketing/upsells/[id] — modification complète.
 * DELETE /api/admin/marketing/upsells/[id] — refusée si l'offre a des
 *   acceptations (cohérence des commandes complémentaires) : proposer la
 *   désactivation.
 */

const idSchema = z.string().min(1)
const partialUpsell = partialUpsellSchema

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await requireStaff("upsells.manage")
    const { id } = await params
    const offerId = idSchema.parse(id)

    const offer = await db.upsellOffer.findUnique({ where: { id: offerId } })
    if (!offer) throw new ApiError("Offre upsell introuvable.", 404)

    const body = await parseBody(request, partialUpsell)

    // Cohérence prix si le produit ou le prix spécial change
    const productId = body.offerProductId ?? offer.offerProductId
    const product = await db.product.findFirst({ where: { id: productId, deletedAt: null } })
    if (!product) throw new ApiError("Produit proposé introuvable.", 404)
    const normalPrice = product.salePrice ?? product.price
    const specialPrice = body.specialPrice ?? offer.specialPrice
    if (specialPrice >= normalPrice) {
      throw new ApiError(
        `Le prix spécial (${specialPrice} FCFA) doit rester inférieur au prix normal du produit (${normalPrice} FCFA).`,
        422,
      )
    }

    const updated = await db.upsellOffer.update({
      where: { id: offerId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.triggerType !== undefined ? { triggerType: body.triggerType } : {}),
        ...(body.triggerProductIds !== undefined
          ? { triggerProductIdsJson: JSON.stringify(body.triggerProductIds) }
          : {}),
        ...(body.triggerCategoryIds !== undefined
          ? { triggerCategoryIdsJson: JSON.stringify(body.triggerCategoryIds) }
          : {}),
        ...(body.triggerMinAmount !== undefined ? { triggerMinAmount: body.triggerMinAmount } : {}),
        ...(body.offerProductId !== undefined ? { offerProductId: body.offerProductId } : {}),
        ...(body.specialPrice !== undefined ? { specialPrice: body.specialPrice } : {}),
        ...(body.message !== undefined ? { message: body.message } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl ?? null } : {}),
        ...(body.startsAt !== undefined ? { startsAt: body.startsAt } : {}),
        ...(body.endsAt !== undefined ? { endsAt: body.endsAt } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.maxAccepts !== undefined ? { maxAccepts: body.maxAccepts } : {}),
        ...(body.showOnThankYou !== undefined ? { showOnThankYou: body.showOnThankYou } : {}),
        ...(body.showInCart !== undefined ? { showInCart: body.showInCart } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
      },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: body.isActive === undefined ? "upsell.update" : "upsell.toggle_active",
      entityType: "upsell_offer",
      entityId: offerId,
      details: {
        nom: updated.name,
        ...(body.isActive !== undefined ? { active: updated.isActive } : {}),
      },
    })

    return ok({ id: updated.id, isActive: updated.isActive })
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireStaff("upsells.manage")
    const { id } = await params
    const offerId = idSchema.parse(id)

    const offer = await db.upsellOffer.findUnique({
      where: { id: offerId },
      include: { _count: { select: { acceptances: true } } },
    })
    if (!offer) throw new ApiError("Offre upsell introuvable.", 404)

    if (offer._count.acceptances > 0 || offer.acceptedCount > 0) {
      throw new ApiError(
        `Impossible de supprimer « ${offer.name} » : ${offer.acceptedCount} acceptation(s) ont généré des commandes complémentaires. Désactivez-la pour conserver la cohérence des ventes.`,
        409,
        "USED_UPSELL",
      )
    }

    await db.upsellOffer.delete({ where: { id: offerId } })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "upsell.delete",
      entityType: "upsell_offer",
      entityId: offerId,
      details: { nom: offer.name },
    })

    return ok({ id: offerId, deleted: true })
  } catch (error) {
    if (error instanceof ApiError) return fail(error.message, error.status, error.code)
    console.error("[api]", error)
    return fail("Une erreur interne est survenue. Veuillez réessayer.", 500)
  }
}
