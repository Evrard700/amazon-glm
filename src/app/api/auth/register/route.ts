import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { hashPassword, createSession, generateReferralCode } from "@/lib/auth"
import { attachReferrer } from "@/lib/services/referrals"
import { logActivity } from "@/lib/activity"
import { enforceRateLimit } from "@/lib/rate-limit"

const schema = z.object({
  name: z.string().min(2, "nom trop court"),
  email: z.string().email("adresse email invalide"),
  password: z.string().min(8, "mot de passe : 8 caractères minimum"),
  phone: z.string().min(6, "téléphone requis").max(20),
  referralCode: z.string().trim().max(30).optional().nullable(),
  marketingConsent: z.boolean().optional(),
})

export async function POST(request: Request) {
  return handle(async () => {
    enforceRateLimit(request, "register", 5, 60_000) // anti spam création de comptes
    const body = await parseBody(request, schema)
    const email = body.email.toLowerCase().trim()
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) throw new ApiError("Un compte existe déjà avec cet email.", 409)

    let referralResult: { ok: boolean; reason?: string } = { ok: false }
    if (body.referralCode) {
      const referrer = await db.user.findUnique({ where: { referralCode: body.referralCode.toUpperCase() } })
      if (!referrer) throw new ApiError("Code de parrainage invalide.", 400)
    }

    const user = await db.user.create({
      data: {
        name: body.name.trim(),
        email,
        passwordHash: hashPassword(body.password),
        phone: body.phone.trim(),
        role: "CUSTOMER",
        referralCode: generateReferralCode(body.name),
        marketingConsent: body.marketingConsent ?? false,
      },
    })

    if (body.referralCode) {
      referralResult = await attachReferrer(user.id, body.referralCode, "SIGNUP")
    }

    await createSession(user)
    await logActivity({
      actor: { id: user.id, name: user.name, role: user.role },
      action: "auth.register",
      entityType: "user",
      entityId: user.id,
      details: { referralApplied: referralResult.ok },
    })

    return ok({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      referral: referralResult.ok ? "ok" : (referralResult as { reason?: string }).reason ?? "non appliqué",
    })
  })
}
