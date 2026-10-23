import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { generateCouponCode } from "../../../_lib/helpers"

/**
 * POST /api/admin/marketing/abandoned-carts/[cartId]/recovery-coupon
 * Crée un coupon de récupération ciblé (code RETOUR-XXXXXX, validité 7 jours)
 * réservé au client titulaire du panier, et marque le panier comme « coupon
 * de récupération créé ». AUCUN envoi automatique : l'envoi réel nécessite un
 * fournisseur configuré (voir module Campagnes) — message honnête retourné.
 */

const schema = z
  .object({
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.coerce.number().int("Montant entier requis.").min(1),
    validityDays: z.coerce.number().int().min(1).max(90).default(7),
    minOrderAmount: z.coerce.number().int().min(0).max(100_000_000).default(0),
  })
  .superRefine((data, ctx) => {
    if (data.type === "PERCENT" && (data.value < 1 || data.value > 100)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Un pourcentage doit être compris entre 1 et 100.",
      })
    }
    if (data.type === "FIXED" && data.value < 500) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Un montant fixe pertinent doit être d'au moins 500 FCFA.",
      })
    }
  })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cartId: string }> },
) {
  return handle(async () => {
    const actor = await requireStaff("campaigns.manage")
    const { cartId } = await params
    if (!cartId) throw new ApiError("Identifiant de panier manquant.", 400)

    const body = await parseBody(request, schema)

    const cart = await db.cart.findUnique({
      where: { id: cartId },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (!cart) throw new ApiError("Panier introuvable.", 404)
    if (cart.status !== "ACTIVE") {
      throw new ApiError("Ce panier n'est plus actif (converti ou fusionné).", 409)
    }
    if (!cart.user) {
      throw new ApiError(
        "Ce panier appartient à un invité : aucun compte client à qui cibler un coupon. Utilisez plutôt une campagne générique une fois un fournisseur d'envoi configuré.",
        409,
        "GUEST_CART",
      )
    }

    // Code unique RETOUR-XXXXXX
    let code = generateCouponCode("RETOUR")
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await db.coupon.findUnique({ where: { code } })
      if (!exists) break
      code = generateCouponCode("RETOUR")
    }

    const expiresAt = new Date(Date.now() + body.validityDays * 24 * 60 * 60 * 1000)

    const coupon = await db.coupon.create({
      data: {
        code,
        type: body.type,
        value: body.value,
        description: `Coupon de récupération de panier pour ${cart.user.name}${cart.recoveryCouponSentAt ? " (relance)" : ""} — créé par ${actor.name}.`,
        minOrderAmount: body.minOrderAmount,
        perCustomerLimit: 1,
        maxUses: 1,
        userId: cart.user.id,
        expiresAt,
        isActive: true,
        createdById: actor.id,
      },
    })

    await db.cart.update({
      where: { id: cart.id },
      data: { recoveryCouponSentAt: new Date() },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "cart.recovery_coupon_create",
      entityType: "cart",
      entityId: cart.id,
      details: {
        code: coupon.code,
        client: cart.user.email,
        type: coupon.type,
        valeur: coupon.value,
        expire: coupon.expiresAt,
        envoiReel: false,
      },
    })

    return ok(
      {
        coupon: { id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value, expiresAt: coupon.expiresAt },
        customer: cart.user,
        message:
          "Coupon créé et ciblé vers le client — l'envoi réel du message nécessite un fournisseur configuré (module Campagnes). Aucun e-mail n'a été envoyé automatiquement.",
      },
      201,
    )
  })
}
