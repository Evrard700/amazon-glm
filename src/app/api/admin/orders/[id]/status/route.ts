import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { invalidateCache } from "@/lib/cache"
import { transitionOrderStatus } from "@/lib/services/orders"
import { ORDER_STATUSES } from "@/lib/constants"

type Params = { params: Promise<{ id: string }> }

const schema = z.object({
  status: z.enum(ORDER_STATUSES),
  trackingNumber: z.string().max(80).optional(),
})

/**
 * Transition de statut de commande (permission orders.manage) via le service métier.
 * Livraison d'une commande COD → confirmation automatique du paiement.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("orders.manage")
    const { id } = await params
    const body = await parseBody(request, schema)

    const order = await db.order.findUnique({ where: { id } })
    if (!order) throw new ApiError("Commande introuvable.", 404)

    if (body.status === "SHIPPED" && !order.trackingNumber && !body.trackingNumber) {
      throw new ApiError("Renseignez un numéro de suivi pour expédier la commande.", 422)
    }

    await transitionOrderStatus(id, body.status, { id: actor.id, name: actor.name, role: actor.role }, { trackingNumber: body.trackingNumber })
    // Les vues admin d00e9pendent des commandes : purge imm00e9diate
    invalidateCache("admin:orders")
    invalidateCache("admin:dashboard")
    invalidateCache("admin:customers")
    invalidateCache("admin:analytics")

    return ok({ id, status: body.status, message: "Statut mis à jour." })
  })
}
