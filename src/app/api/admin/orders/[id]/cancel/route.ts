import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { invalidateCache } from "@/lib/cache"
import { cancelOrder } from "@/lib/services/orders"

type Params = { params: Promise<{ id: string }> }

const schema = z.object({
  reason: z.string().min(3).max(300),
})

/**
 * Annulation de commande — permission orders.manage, via le service cancelOrder :
 * restock physique, révocation des accès numériques, annulation des récompenses.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("orders.manage")
    const { id } = await params
    const body = await parseBody(request, schema)

    const order = await db.order.findUnique({ where: { id }, select: { orderNumber: true, orderStatus: true } })
    if (!order) throw new ApiError("Commande introuvable.", 404)
    if (["CANCELLED", "REFUNDED"].includes(order.orderStatus)) {
      throw new ApiError("Cette commande est déjà annulée ou remboursée.", 409)
    }

    await cancelOrder(id, body.reason, { id: actor.id, name: actor.name, role: actor.role })
    // Les vues admin d00e9pendent des commandes : purge imm00e9diate
    invalidateCache("admin:orders")
    invalidateCache("admin:dashboard")
    invalidateCache("admin:customers")
    invalidateCache("admin:analytics")
    return ok({ id, message: "Commande annulée — stock restitué, accès numériques révoqués, récompenses suspendues." })
  })
}
