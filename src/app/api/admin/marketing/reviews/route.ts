import { z } from "zod"
import { db } from "@/lib/db"
import { cached, invalidateCache } from "@/lib/cache"
import { ok, handle } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { parseJson } from "@/lib/json"

/**
 * GET /api/admin/marketing/reviews?status=PENDING|APPROVED|REJECTED|ALL
 * Modération des avis clients (permission reviews.moderate).
 */

const querySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]).default("ALL"),
})

export async function GET(request: Request) {
  return handle(async () => {
    await requireStaff("reviews.moderate")
    const url = new URL(request.url)
    const { status } = querySchema.parse({ status: url.searchParams.get("status") ?? "ALL" })

    const [reviews, counts] = await cached(
      `admin:marketing:reviews:${status}`,
      15_000,
      () =>
        Promise.all([
          db.review.findMany({
            where: status === "ALL" ? {} : { status },
            orderBy: { createdAt: "desc" },
            take: 300,
            include: {
              product: {
                select: { id: true, name: true, slug: true, imagesJson: true, ratingAvg: true, ratingCount: true },
              },
              user: { select: { name: true, email: true } },
            },
          }),
          db.review.groupBy({ by: ["status"], _count: { id: true } }),
        ]),
      180_000,
    )
    const countBy = (s: string) => counts.find((c) => c.status === s)?._count.id ?? 0

    return ok({
      counts: {
        PENDING: countBy("PENDING"),
        APPROVED: countBy("APPROVED"),
        REJECTED: countBy("REJECTED"),
        total: counts.reduce((s, c) => s + c._count.id, 0),
      },
      reviews: reviews.map((r) => ({
        id: r.id,
        product: {
          id: r.product.id,
          name: r.product.name,
          slug: r.product.slug,
          image: parseJson<string[]>(r.product.imagesJson, [])[0] ?? null,
          ratingAvg: r.product.ratingAvg,
          ratingCount: r.product.ratingCount,
        },
        author: r.user ? { name: r.user.name, email: r.user.email } : { name: r.authorName, email: null },
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        isVerifiedBuyer: r.isVerifiedBuyer,
        status: r.status,
        adminReply: r.adminReply,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    })
  })
}
