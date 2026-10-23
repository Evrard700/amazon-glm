import { z } from "zod"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { getSessionUser } from "@/lib/auth"
import { acceptUpsell, eligibleUpsellsForOrder } from "@/lib/services/upsells"
import { db } from "@/lib/db"
import { enforceRateLimit } from "@/lib/rate-limit"
import type { Order, User } from "@prisma/client"

/**
 * OFFRES UPSELL POST-COMMANDE — aucun prix ni décision côté client.
 *
 * SÉCURITÉ (anti-IDOR) : chaque accès est lié à la commande RÉELLEMENT
 * possédée par l'appelant :
 *  - client connecté  → order.userId doit correspondre à sa session ;
 *  - invité (ou lien) → le jeton d'accès secret de la commande doit être
 *    fourni ET correspondre exactement.
 * Sans preuve valide : 403 (l'existence même d'une commande ne fuite pas).
 */
async function authorizeUpsellAccess(orderId: string, token: string | null) {
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) throw new ApiError("Commande introuvable.", 404)
  const user = await getSessionUser()
  const owns = !!(user && order.userId && order.userId === user.id)
  const hasValidToken = !!token && token === order.accessToken
  if (!owns && !hasValidToken) {
    throw new ApiError("Cette commande ne vous appartient pas.", 403)
  }
  return { order, user }
}

export async function GET(request: Request) {
  return handle(async () => {
    enforceRateLimit(request, "upsell-get", 30, 60_000)
    const url = new URL(request.url)
    const orderId = url.searchParams.get("orderId")
    if (!orderId) throw new ApiError("Paramètre orderId requis.", 400)
    const token = url.searchParams.get("token")
    await authorizeUpsellAccess(orderId, token)
    const offers = await eligibleUpsellsForOrder(orderId)
    return ok({ offers })
  })
}

const acceptSchema = z.object({
  offerId: z.string().min(1),
  orderId: z.string().min(1),
  accessToken: z.string().min(10).optional(),
})

/** Le client accepte EXPLICITEMENT l'offre — crée une commande complémentaire liée. */
export async function POST(request: Request) {
  return handle(async () => {
    enforceRateLimit(request, "upsell", 10, 60_000)
    const body = await parseBody(request, acceptSchema)
    const { user } = await authorizeUpsellAccess(body.orderId, body.accessToken ?? null)

    const result = await acceptUpsell(body.offerId, body.orderId, user ? { id: user.id, name: user.name } : null)
    return ok(result)
  })
}
