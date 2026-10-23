// POST /api/products/[slug]/reviews — publier un avis.
// Règles : rate limit (429), connexion requise (401), produit actif (404),
// acheteur vérifié — commande PAYÉE contenant le produit (403),
// un seul avis par client/produit (409).
import { z } from "zod"
import { handle, ok, parseBody, ApiError } from "@/lib/api"
import { db } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { canReviewProduct, createReview } from "@/lib/services/reviews"
import { enforceRateLimit } from "@/lib/rate-limit"
import { invalidateCache } from "@/lib/cache"

const bodySchema = z.object({
  rating: z.number().int().min(1, "la note doit être entre 1 et 5").max(5),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  comment: z.string().trim().min(3, "le commentaire est trop court").max(2000),
})

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await params
    // Anti-spam : 5 avis / minute / IP (protection publiée au prompt maître §21)
    enforceRateLimit(request, "review", 5, 60_000)
    const user = await requireUser()

    const product = await db.product.findFirst({
      where: { slug, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    })
    if (!product) throw new ApiError("Produit introuvable.", 404)

    const body = await parseBody(request, bodySchema)

    const isVerifiedBuyer = await canReviewProduct(user.id, product.id)
    if (!isVerifiedBuyer) {
      throw new ApiError(
        "Seuls les clients ayant acheté ce produit (commande payée) peuvent publier un avis.",
        403,
        "NOT_VERIFIED_BUYER",
      )
    }

    const { review } = await createReview({
      userId: user.id,
      authorName: user.name,
      productId: product.id,
      rating: body.rating,
      title: body.title || undefined,
      comment: body.comment,
    })

    // L'avis met à jour les agrégats produit (ratingAvg/ratingCount) → invalide
    // la fiche mise en cache (10 s) et le catalogue (notes sur les cartes).
    invalidateCache(`product:${slug}`)
    invalidateCache("catalog")

    const message =
      review.status === "APPROVED"
        ? "Merci ! Votre avis est publié."
        : "Avis envoyé, en attente de modération."

    return ok({ message, status: review.status }, 201)
  })
}
