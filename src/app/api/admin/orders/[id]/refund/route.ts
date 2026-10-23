import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { invalidateCache } from "@/lib/cache"
import { refundOrder } from "@/lib/services/orders"

type Params = { params: Promise<{ id: string }> }

const schema = z.object({
  amount: z.number().int().min(1),
  mode: z.enum(["STORE_CREDIT", "MANUAL"]),
  reason: z.string().min(3).max(300),
  note: z.string().max(300).optional(),
})

/**
 * Remboursement — permission refunds.approve, via le service refundOrder.
 * STORE_CREDIT : crédit immédiat + journal. MANUAL : reste « à effectuer »
 * jusqu'à confirmation humaine (route …/refund/[refundId]/processed).
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("refunds.approve")
    const { id } = await params
    const body = await parseBody(request, schema)

    const order = await db.order.findUnique({ where: { id }, select: { orderNumber: true } })
    if (!order) throw new ApiError("Commande introuvable.", 404)

    const result = await refundOrder(id, { amount: body.amount, mode: body.mode, reason: body.reason, note: body.note }, { id: actor.id, name: actor.name, role: actor.role })

    // Les vues admin dépendent des commandes : purge immédiate
    invalidateCache("admin:orders")
    invalidateCache("admin:dashboard")
    invalidateCache("admin:customers")
    invalidateCache("admin:analytics")

    return ok({
      id,
      refundId: result.refundId,
      message:
        body.mode === "STORE_CREDIT"
          ? "Remboursement en crédit boutique effectué."
          : "Remboursement manuel enregistré — pensez à le marquer comme effectué après virement.",
    })
  })
}
