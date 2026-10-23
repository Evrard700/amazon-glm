import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { hashPassword, generateReferralCode } from "@/lib/auth"
import { invalidateCache, cached } from "@/lib/cache"

/** Liste des membres du staff (tous rôles ≠ CLIENT) — permission users.view. */
export async function GET() {
  return handle(async () => {
    const actor = await requireStaff("users.view")
    const users = await cached(
      "admin:users",
      15_000,
      () =>
        db.user.findMany({
        where: { role: { not: "CUSTOMER" } },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      180_000,
    )
    return ok({
      actorRole: actor.role,
      users: users.map((u) => ({
        ...u,
        isSelf: u.id === actor.id,
      })),
    })
  })
}

const inviteSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(160),
  role: z.enum(["ADMIN", "MANAGER", "MARKETING", "STAFF"]),
  password: z.string().min(8).max(72),
})

/**
 * Invitation d'un membre du staff — permission users.manage (OWNER uniquement dans
 * la matrice) + garde serveur explicite : seul le OWNER peut inviter.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("users.manage")
    if (actor.role !== "OWNER") {
      throw new ApiError("Seul le compte Propriétaire peut gérer les membres de l'équipe.", 403)
    }
    const body = await parseBody(request, inviteSchema)

    const existing = await db.user.findUnique({ where: { email: body.email.toLowerCase() } })
    if (existing) throw new ApiError("Cet email est déjà utilisé.", 409)

    let referralCode = generateReferralCode(body.name)
    while (await db.user.findUnique({ where: { referralCode } })) {
      referralCode = generateReferralCode(body.name)
    }

    const created = await db.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash: hashPassword(body.password),
        role: body.role,
        referralCode,
        isActive: true,
      },
      select: { id: true, name: true, email: true, role: true },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "user.invite",
      entityType: "user",
      entityId: created.id,
      details: { name: created.name, email: created.email, role: created.role },
    })

    invalidateCache("admin:users")

    return ok({ id: created.id }, 201)
  })
}
