import { db } from "@/lib/db"
import { ApiError } from "@/lib/api"
import { logActivity } from "@/lib/activity"

/**
 * AVIS CLIENTS — publication réservée aux acheteurs vérifiés
 * (commande PAYÉE contenant le produit), modération admin.
 */

export async function canReviewProduct(userId: string, productId: string): Promise<boolean> {
  const items = await db.orderItem.findMany({
    where: { productId, order: { userId, paymentStatus: "PAYMENT_PAID" } },
    select: { orderId: true },
  })
  return items.length > 0
}

export async function createReview(input: {
  userId: string
  authorName: string
  productId: string
  rating: number
  title?: string
  comment: string
}) {
  const product = await db.product.findFirst({ where: { id: input.productId, deletedAt: null } })
  if (!product) throw new ApiError("Produit introuvable.", 404)

  const existing = await db.review.findFirst({ where: { productId: input.productId, userId: input.userId } })
  if (existing) throw new ApiError("Vous avez déjà publié un avis pour ce produit.", 409)

  const isVerifiedBuyer = await canReviewProduct(input.userId, input.productId)

  const settings = await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })
  const status = isVerifiedBuyer && settings.reviewsAutoApprove ? "APPROVED" : "PENDING"

  const review = await db.review.create({
    data: {
      productId: input.productId,
      userId: input.userId,
      authorName: input.authorName,
      rating: Math.min(5, Math.max(1, Math.round(input.rating))),
      title: input.title ?? null,
      comment: input.comment,
      isVerifiedBuyer,
      status,
    },
  })

  if (status === "APPROVED") await recomputeProductRating(input.productId)

  await logActivity({
    actor: { id: input.userId, name: input.authorName, role: "CUSTOMER" },
    action: "review.create",
    entityType: "product",
    entityId: input.productId,
    details: { reviewId: review.id, status },
  })

  return { review, isVerifiedBuyer, status }
}

export async function recomputeProductRating(productId: string) {
  const reviews = await db.review.findMany({ where: { productId, status: "APPROVED" } })
  const count = reviews.length
  const avg = count === 0 ? 0 : reviews.reduce((s, r) => s + r.rating, 0) / count
  await db.product.update({
    where: { id: productId },
    data: { ratingAvg: Math.round(avg * 10) / 10, ratingCount: count },
  })
}
