import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"

/**
 * PATCH /api/admin/marketing/reviews/[id] { adminReply }
 * Réponse publique de l'administration à un avis (visible côté client).
 */

const idSchema = z.string().min(1)
const bodySchema = z.object({
  adminReply: z
    .string()
    .trim()
    .min(2, "La réponse doit contenir au moins 2 caractères.")
    .max(1000, "Réponse trop longue (1000 caractères max).")
    .nullable(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await requireStaff("reviews.moderate")
    const { id } = await params
    const reviewId = idSchema.parse(id)
    const body = await parseBody(request, bodySchema)

    const review = await db.review.findUnique({
      where: { id: reviewId },
      include: { product: { select: { name: true } } },
    })
    if (!review) throw new ApiError("Avis introuvable.", 404)

    const updated = await db.review.update({
      where: { id: reviewId },
      data: { adminReply: body.adminReply ?? null },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: body.adminReply ? "review.reply" : "review.reply_remove",
      entityType: "review",
      entityId: reviewId,
      details: {
        produit: review.product.name,
        auteur: review.authorName,
        reponse: body.adminReply ? body.adminReply.slice(0, 200) : null,
      },
    })

    invalidateCache("admin:marketing")
    invalidateCache("catalog:reviews")

    return ok({ id: updated.id, adminReply: updated.adminReply })
  })
}
