import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody } from "@/lib/api"
import { getSessionUser } from "@/lib/auth"
import { enforceRateLimit } from "@/lib/rate-limit"

/**
 * Vérification d'un code de parrainage AVANT inscription (champ optionnel du
 * formulaire /register). Aucune authentification requise : le visiteur n'a pas
 * encore de compte. Mêmes règles d'éligibilité que attachReferrer().
 */
const schema = z.object({ code: z.string().trim().min(2, "code requis").max(30) })

export async function POST(request: Request) {
  return handle(async () => {
    enforceRateLimit(request, "referral-check", 10, 60_000)
    const body = await parseBody(request, schema)
    const clean = body.code.trim().toUpperCase()

    const referrer = await db.user.findUnique({ where: { referralCode: clean } })
    if (!referrer || !referrer.isActive) {
      return ok({ valid: false, error: "Ce code de parrainage n'existe pas." })
    }
    if (referrer.role !== "CUSTOMER" && referrer.role !== "OWNER") {
      return ok({ valid: false, error: "Ce code de parrainage n'est pas éligible." })
    }

    // Auto-parrainage impossible si le visiteur est déjà connecté
    const current = await getSessionUser()
    if (current && current.id === referrer.id) {
      return ok({ valid: false, error: "Vous ne pouvez pas utiliser votre propre code de parrainage." })
    }

    // Prénom affiché (ex: « Aminata Traoré » → « Aminata »)
    const firstName = referrer.name.trim().split(/\s+/)[0]
    return ok({ valid: true, referrerName: referrer.name, referrerFirstName: firstName })
  })
}
