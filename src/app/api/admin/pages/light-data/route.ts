import { db } from "@/lib/db"
import { ok, handle } from "@/lib/api"
import { requireStaff } from "@/lib/auth"

/** Listes légères pour les sélecteurs de l'éditeur visuel (sections). */
export async function GET() {
  return handle(async () => {
    await requireStaff("storefront.edit")
    const [products, collections, categories, pages] = await Promise.all([
      db.product.findMany({
        where: { deletedAt: null, status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true, type: true },
      }),
      db.collection.findMany({ where: { isActive: true }, orderBy: { position: "asc" }, select: { slug: true, name: true } }),
      db.category.findMany({ where: { isActive: true }, orderBy: { position: "asc" }, select: { slug: true, name: true } }),
      db.page.findMany({ where: { isPublished: true }, orderBy: { title: "asc" }, select: { slug: true, title: true } }),
    ])
    return ok({ products, collections, categories, pages })
  })
}
