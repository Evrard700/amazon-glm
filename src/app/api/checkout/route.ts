import { z } from "zod"
import { ok, handle, parseBody } from "@/lib/api"
import { getSessionUser } from "@/lib/auth"
import { createOrderFromCart } from "@/lib/services/orders"
import { enforceRateLimit } from "@/lib/rate-limit"

const schema = z.object({
  customerName: z.string().min(2, "nom requis").max(120),
  customerEmail: z.string().email("email invalide").max(160),
  customerPhone: z.string().min(6, "téléphone requis").max(20),
  address: z.string().min(4, "adresse requise").max(300),
  city: z.string().min(2, "ville requise").max(80),
  shippingZoneId: z.string().min(1, "zone de livraison requise"),
  paymentMethodCode: z.string().min(1, "moyen de paiement requis"),
  deliveryNote: z.string().max(500).optional(),
  useCredit: z.boolean().optional(),
})

export async function POST(request: Request) {
  return handle(async () => {
    enforceRateLimit(request, "checkout", 6, 60_000) // anti spam commandes
    const body = await parseBody(request, schema)
    const user = await getSessionUser()

    // La session est transmise au service (cache 5 s) : plus AUCUN rechargement
    // utilisateur DB côté service, et le récapitulatif commande revient avec le
    // résultat (plus de re-fetch final).
    const result = await createOrderFromCart({ ...body, sessionUser: user })

    return ok({
      ...result,
      confirmationUrl: `/order-confirmation/${result.orderNumber}?token=${result.accessToken}`,
    })
  })
}
