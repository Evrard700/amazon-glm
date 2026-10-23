import { db } from "@/lib/db"
import { handle, ok } from "@/lib/api"
import { requireAnyPermission } from "../_lib/helpers"

/**
 * GET /api/admin/marketing/categories
 * Liste légère de catégories (id, nom, slug) pour les sélecteurs marketing.
 */
export async function GET() {
  return handle(async () => {
    await requireAnyPermission([
      "products.view",
      "coupons.manage",
      "promotions.manage",
      "upsells.manage",
      "campaigns.manage",
    ])

    const categories = await db.category.findMany({
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { products: true } },
      },
    })

    return ok(
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        productCount: c._count.products,
      })),
    )
  })
}
