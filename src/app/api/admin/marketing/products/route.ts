import { db } from "@/lib/db"
import { handle, ok } from "@/lib/api"
import { parseJson } from "@/lib/json"
import { requireAnyPermission } from "../_lib/helpers"

/**
 * GET /api/admin/marketing/products
 * Liste légère de produits (id, nom, prix, stock, image) pour les sélecteurs
 * des coupons, promotions, upsells et simulateur. Aucun prix ni stock modifiable
 * ici : lecture seule stricte.
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

    const products = await db.product.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "DRAFT"] } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        type: true,
        status: true,
        price: true,
        salePrice: true,
        stock: true,
        imagesJson: true,
        categories: { select: { categoryId: true, category: { select: { name: true } } } },
      },
    })

    return ok(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        type: p.type,
        status: p.status,
        price: p.price,
        salePrice: p.salePrice,
        unitPrice: p.salePrice ?? p.price,
        stock: p.stock,
        image: parseJson<string[]>(p.imagesJson, [])[0] ?? null,
        categoryIds: p.categories.map((c) => c.categoryId),
        categoryName: p.categories.map((c) => c.category.name).join(", ") || null,
      })),
    )
  })
}
