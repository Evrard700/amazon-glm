import { db } from "@/lib/db"
import { ok, handle, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"

type Params = { params: Promise<{ id: string }> }

/** Restauration depuis la corbeille. */
export async function POST(_request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    const { id } = await params
    const product = await db.product.findUnique({ where: { id } })
    if (!product) throw new ApiError("Produit introuvable.", 404)
    if (!product.deletedAt) throw new ApiError("Ce produit n'est pas dans la corbeille.", 409)

    await db.product.update({ where: { id }, data: { deletedAt: null, status: "DRAFT" } })
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "product.restore",
      entityType: "product",
      entityId: id,
      details: { name: product.name },
    })

    invalidateCache("catalog")
    invalidateCache("product:")

    return ok({ id })
  })
}
