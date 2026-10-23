import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { recomputeProductRating } from "@/lib/services/reviews"
import { invalidateCache } from "@/lib/cache"

/**
 * POST /api/admin/marketing/reviews/[id]/approve
 * Publie un avis PENDING → APPROVED puis RECALCULE la note moyenne du produit
 * (jamais de note stockée à la main : `recomputeProductRating` fait foi).
 */

const idSchema = z.string().min(1)

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await requireStaff("reviews.moderate")
    const { id } = await params
    const reviewId = idSchema.parse(id)

    const review = await db.review.findUnique({
      where: { id: reviewId },
      include: { product: { select: { id: true, name: true, slug: true } } },
    })
    if (!review) throw new ApiError("Avis introuvable.", 404)
    if (review.status !== "PENDING" && review.status !== "REJECTED") {
      throw new ApiError("Cet avis est déjà publié.", 409)
    }

    await db.review.update({ where: { id: reviewId }, data: { status: "APPROVED" } })
    const { ratingAvg, ratingCount } = await recomputeAndFetch(review.productId)

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "review.approve",
      entityType: "review",
      entityId: reviewId,
      details: {
        produit: review.product.name,
        auteur: review.authorName,
        note: review.rating,
        nouvelleMoyenne: ratingAvg,
        nombreAvis: ratingCount,
      },
    })

    invalidateCache("admin:marketing")
    invalidateCache("reviews:latest")
    invalidateCache("product:")
    return ok({ id: reviewId, status: "APPROVED", productId: review.productId, ratingAvg, ratingCount })
  })
}

async function recomputeAndFetch(productId: string) {
  await recomputeProductRating(productId)
  const product = await db.product.findUniqueOrThrow({
    where: { id: productId },
    select: { ratingAvg: true, ratingCount: true },
  })
  return product
}
