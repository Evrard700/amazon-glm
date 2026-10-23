import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail, handle, ApiError } from "@/lib/api"
import { parseJson } from "@/lib/json"
import { enforceRateLimit } from "@/lib/rate-limit"
import { createHmac, timingSafeEqual } from "crypto"

/**
 * WEBHOOK PAIEMENTS — vérifié (signature HMAC), idempotent (dedupKey unique).
 * Si le fournisseur n'a pas de secret webhook configuré côté serveur, la route
 * répond 501 avec un message clair : AUCUNE simulation de paiement.
 */

const payloadSchema = z.object({
  event: z.object({
    id: z.string().min(1).optional(),
    type: z.string().min(1),
    reference: z.string().min(1),
  }).passthrough(),
})

// ALLOWLIST STRICTE des événements reconnus (pas de sous-chaîne :
// "underpaid"/"un_paid" ne doivent JAMAIS déclencher une confirmation).
const PAID_EVENTS = new Set([
  "payment.succeeded",
  "payment.paid",
  "charge.succeeded",
  "checkout.completed",
  "payment.confirmed",
])
const FAILED_EVENTS = new Set([
  "payment.failed",
  "payment.cancelled",
  "charge.failed",
  "checkout.expired",
])

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handle(async () => {
    // Anti-DoS : le coût de vérification HMAC est payé par le serveur —
    // plafonner les tentatives par IP protège aussi les retours en rafale.
    enforceRateLimit(request, "webhook", 120, 60_000)
    const { provider } = await params
    const method = await db.paymentMethod.findUnique({ where: { code: provider } })
    if (!method || !method.isOnline) {
      return fail(`Fournisseur « ${provider} » inconnu ou non compatible avec les webhooks.`, 404)
    }
    const config = parseJson<Record<string, string>>(method.configJson, {})
    const secret = config.webhookSecret
    if (!secret) {
      return fail(
        `Le fournisseur « ${method.name} » n'est pas configuré : un secret webhook serveur est requis. Aucun paiement n'est traité.`,
        501,
      )
    }

    // Vérification de la signature (x-signature = HMAC-SHA256 du corps brut)
    const raw = await request.text()
    const received = request.headers.get("x-signature") ?? ""
    const expected = createHmac("sha256", secret).update(raw).digest("hex")
    const a = Buffer.from(received)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return fail("Signature webhook invalide.", 401)
    }

    const parsed = payloadSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return fail("Payload webhook invalide.", 422)
    const evt = parsed.data.event

    // Idempotence : dedupKey unique. Deux livraisons CONCURRENTES du même
    // événement font échouer le second create (contrainte unique) — on
    // répond « déjà traité » au lieu d'une erreur 500.
    const dedupKey = `${provider}:${evt.id ?? `${evt.type}:${evt.reference}`}`
    const existing = await db.paymentEvent.findUnique({ where: { dedupKey } })
    if (existing?.processed) return ok({ received: true, processed: false, reason: "already_processed" })

    let record
    try {
      record =
        existing ??
        (await db.paymentEvent.create({
          data: {
            provider,
            eventType: evt.type,
            dedupKey,
            payloadJson: raw.slice(0, 10000),
          },
        }))
    } catch {
      // Conflit d'unicité : une livraison concurrente a déjà enregistré l'événement.
      return ok({ received: true, processed: false, reason: "already_processed" })
    }

    try {
      const payment = await db.payment.findFirst({ where: { reference: evt.reference } })
      if (payment) {
        await db.paymentEvent.update({
          where: { id: record.id },
          data: { paymentId: payment.id, processed: true, processedAt: new Date() },
        })
        if (PAID_EVENTS.has(evt.type)) {
          const { confirmPayment } = await import("@/lib/services/orders")
          await confirmPayment(payment.orderId, { id: "webhook", name: `Webhook ${method.name}`, role: "SYSTEM" }, {
            reference: evt.reference,
            source: "webhook",
          })
        } else if (FAILED_EVENTS.has(evt.type)) {
          const { markPaymentFailed } = await import("@/lib/services/orders")
          await markPaymentFailed(payment.orderId, `Événement fournisseur : ${evt.type}`, null)
        }
      } else {
        await db.paymentEvent.update({
          where: { id: record.id },
          data: { processed: true, processedAt: new Date(), error: "Paiement introuvable pour cette référence." },
        })
      }
      return ok({ received: true, processed: true })
    } catch (error) {
      if (error instanceof ApiError) return fail(error.message, error.status)
      throw error
    }
  })
}
