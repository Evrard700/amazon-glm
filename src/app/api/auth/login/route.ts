import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { verifyPassword, createSession } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { enforceRateLimit, enforceRateLimitKey } from "@/lib/rate-limit"

const schema = z.object({
  email: z.string().email("adresse email invalide"),
  password: z.string().min(1, "mot de passe requis"),
  staffLogin: z.boolean().optional(),
})

export async function POST(request: Request) {
  return handle(async () => {
    enforceRateLimit(request, "login", 8, 60_000) // anti brute-force (par IP)
    const body = await parseBody(request, schema)
    const user = await db.user.findUnique({ where: { email: body.email.toLowerCase().trim() } })
    if (!user) throw new ApiError("Email ou mot de passe incorrect.", 401)
    // Anti brute-force CIBLÉ par compte, indépendant de l'IP (utile si
    // l'attaquant tourne entre plusieurs adresses) : 8 tentatives par quart
    // d'heure et par compte.
    enforceRateLimitKey(`login-acct:${user.id}`, 8, 15 * 60_000)
    if (!verifyPassword(body.password, user.passwordHash)) {
      throw new ApiError("Email ou mot de passe incorrect.", 401)
    }
    if (!user.isActive) throw new ApiError("Ce compte est désactivé. Contactez le support.", 403)

    // Un client ordinaire ne peut PAS se connecter côté admin
    if (body.staffLogin && !["OWNER", "ADMIN", "MANAGER", "MARKETING", "STAFF"].includes(user.role)) {
      throw new ApiError("Ce compte n'a pas accès à l'administration.", 403)
    }

    await createSession(user)
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await logActivity({
      actor: { id: user.id, name: user.name, role: user.role },
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
      details: { staffLogin: body.staffLogin ?? false },
    })

    return ok({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, storeCredit: user.storeCredit },
      redirectTo: body.staffLogin ? "/admin" : user.role === "CUSTOMER" ? "/account" : "/admin",
    })
  })
}
