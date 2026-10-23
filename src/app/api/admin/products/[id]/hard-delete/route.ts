import { db } from "@/lib/db"
import { ok, handle, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"

type Params = { params: Promise<{ id: string }> }

/**
 * Suppression DÉFINITIVE — refusée si le produit est lié à des commandes
 * (traçabilité historique) : les lignes de commande référencent le produit.
 */
export async function POST(_request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    const { id } = await params
    const product = await db.product.findUnique({
      where: { id },
      include: { _count: { select: { orderItems: true } } },
    })
    if (!product) throw new ApiError("Produit introuvable.", 404)
    if (!product.deletedAt) {
      throw new ApiError("Placez d'abord le produit dans la corbeille avant de le supprimer définitivement.", 409)
    }
    if (product._count.orderItems > 0) {
      throw new ApiError(
        `Suppression impossible : ${product._count.orderItems} ligne(s) de commande référencent ce produit. Conservez-le en archive pour préserver l'historique.`,
        409,
      )
    }

    await db.$transaction(async (tx) => {
      // Nettoyage des références non historiques (paniers, relations, avis)
      await tx.cartItem.deleteMany({ where: { productId: id } })
      await tx.productCategory.deleteMany({ where: { productId: id } })
      await tx.productCollection.deleteMany({ where: { productId: id } })
      await tx.review.deleteMany({ where: { productId: id } })
      await tx.productVariant.deleteMany({ where: { productId: id } })
      await tx.product.delete({ where: { id } })
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "product.hard_delete",
      entityType: "product",
      entityId: id,
      details: { name: product.name, slug: product.slug },
    })

    invalidateCache("catalog")
    invalidateCache("product:")
    invalidateCache("reviews:latest")

    return ok({ id, deleted: true })
  })
}
