import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { recomputeProductRating } from "@/lib/services/reviews"
import { invalidateCache } from "@/lib/cache"

/**
 * POST /api/admin/marketing/reviews/[id]/reject { reason? }
 * - avis PENDING  → REJETÉ (jamais publié) ;
 * - avis APPROVED → « Rejeter + Retirer » : retour en modération (PENDING)
 *   et recalcul immédiat de la note moyenne du produit (retrait public).
 */

const idSchema = z.string().min(1)
const bodySchema = z.object({
  reason: z.string().trim().max(500, "Raison trop longue (500 max).").optional(),
})

export async function POST(
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
      include: { product: { select: { id: true, name: true } } },
    })
    if (!review) throw new ApiError("Avis introuvable.", 404)

    if (review.status === "PENDING") {
      await db.review.update({ where: { id: reviewId }, data: { status: "REJECTED" } })
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "review.reject",
        entityType: "review",
        entityId: reviewId,
        details: {
          produit: review.product.name,
          auteur: review.authorName,
          note: review.rating,
          raison: body.reason ?? "non précisée",
        },
      })
      invalidateCache("admin:marketing")
      invalidateCache("reviews:latest")
      invalidateCache("product:")
      return ok({ id: reviewId, status: "REJECTED", withdrew: false })
    }

    if (review.status === "APPROVED") {
      // Rejeter + Retirer : l'avis quitte la fiche publique et retourne en modération
      await db.review.update({ where: { id: reviewId }, data: { status: "PENDING" } })
      await recomputeProductRating(review.productId)
      const product = await db.product.findUniqueOrThrow({
        where: { id: review.productId },
        select: { ratingAvg: true, ratingCount: true },
      })
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "review.withdraw",
        entityType: "review",
        entityId: reviewId,
        details: {
          produit: review.product.name,
          auteur: review.authorName,
          raison: body.reason ?? "non précisée",
          nouvelleMoyenne: product.ratingAvg,
          nombreAvis: product.ratingCount,
        },
      })
      invalidateCache("admin:marketing")
      invalidateCache("reviews:latest")
      invalidateCache("product:")
      return ok({
        id: reviewId,
        status: "PENDING",
        withdrew: true,
        ratingAvg: product.ratingAvg,
        ratingCount: product.ratingCount,
      })
    }

    throw new ApiError(
      "Cet avis est déjà rejeté : utilisez « Approuver » pour le republier.",
      409,
    )
  })
}
