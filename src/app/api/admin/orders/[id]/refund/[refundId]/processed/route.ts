import { db } from "@/lib/db"
import { ok, handle, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { invalidateCache } from "@/lib/cache"
import { markRefundProcessed } from "@/lib/services/orders"

type Params = { params: Promise<{ id: string; refundId: string }> }

/** Marque un remboursement MANUEL comme réellement effectué — permission refunds.approve. */
export async function POST(_request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("refunds.approve")
    const { id, refundId } = await params

    const refund = await db.refund.findUnique({ where: { id: refundId } })
    if (!refund || refund.orderId !== id) throw new ApiError("Remboursement introuvable pour cette commande.", 404)

    await markRefundProcessed(refundId, { id: actor.id, name: actor.name, role: actor.role })
    invalidateCache("admin:orders")
    invalidateCache("admin:dashboard")
    invalidateCache("admin:analytics")
    return ok({ id: refundId, message: "Remboursement confirmé comme effectué." })
  })
}
