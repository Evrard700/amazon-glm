import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { invalidateCache } from "@/lib/cache"
import { confirmPayment } from "@/lib/services/orders"

type Params = { params: Promise<{ id: string }> }

const schema = z.object({
  reference: z.string().max(120).optional(),
})

/**
 * Confirmation manuelle du paiement — permission payments.confirm.
 * Passe par le service métier confirmPayment (seule porte vers les fichiers
 * numériques et les récompenses parrainage). Idempotent.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("payments.confirm")
    const { id } = await params
    const body = await parseBody(request, schema)

    const order = await db.order.findUnique({ where: { id }, select: { orderNumber: true, paymentStatus: true } })
    if (!order) throw new ApiError("Commande introuvable.", 404)
    if (order.paymentStatus === "PAYMENT_PAID") {
      throw new ApiError("Cette commande est déjà payée.", 409)
    }

    await confirmPayment(id, { id: actor.id, name: actor.name, role: actor.role }, { reference: body.reference || undefined, source: "manual" })
    // Les vues admin d00e9pendent des commandes : purge imm00e9diate
    invalidateCache("admin:orders")
    invalidateCache("admin:dashboard")
    invalidateCache("admin:customers")
    invalidateCache("admin:analytics")

    return ok({ id, orderNumber: order.orderNumber, message: "Paiement confirmé — accès numériques débloqués et récompenses traitées." })
  })
}
