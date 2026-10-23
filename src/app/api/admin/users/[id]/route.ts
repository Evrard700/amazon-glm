import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff, hashPassword } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"
import { ROLES, STAFF_ROLES } from "@/lib/constants"

type Params = { params: Promise<{ id: string }> }

const patchSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).max(72).optional(),
  })
  .refine((d) => d.role !== undefined || d.isActive !== undefined || d.password !== undefined, {
    message: "Aucune modification fournie.",
  })
  .refine((d) => d.role === undefined || STAFF_ROLES.includes(d.role as never), {
    message: "Le rôle CLIENT ne peut pas être attribué ici.",
    path: ["role"],
  })

/**
 * Changement de rôle / activation / réinitialisation du mot de passe d'un
 * membre — permission users.manage + OWNER uniquement (double garde).
 * Le compte OWNER initial ne peut être désactivé ni rétrogradé ; on ne
 * modifie pas son propre rôle (anti-verrouillage).
 */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("users.manage")
    if (actor.role !== "OWNER") {
      throw new ApiError("Seul le compte Propriétaire peut gérer les membres de l'équipe.", 403)
    }
    const { id } = await params
    const body = await parseBody(request, patchSchema)

    const target = await db.user.findUnique({ where: { id } })
    if (!target) throw new ApiError("Membre introuvable.", 404)
    if (target.role === "CUSTOMER") throw new ApiError("Ce compte est un client, pas un membre du staff.", 409)

    if (body.role !== undefined && body.role !== target.role) {
      if (target.role === "OWNER") {
        throw new ApiError("Le rôle du compte Propriétaire initial ne peut pas être modifié.", 409)
      }
      if (target.id === actor.id) {
        throw new ApiError("Vous ne pouvez pas modifier votre propre rôle.", 409)
      }
      await db.user.update({ where: { id }, data: { role: body.role } })
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "user.role_change",
        entityType: "user",
        entityId: id,
        details: { from: target.role, to: body.role, member: target.name },
      })
    }

    if (body.isActive !== undefined && body.isActive !== target.isActive) {
      if (target.role === "OWNER") {
        throw new ApiError("Le compte Propriétaire initial ne peut pas être désactivé.", 409)
      }
      await db.user.update({ where: { id }, data: { isActive: body.isActive } })
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "user.active_toggle",
        entityType: "user",
        entityId: id,
        details: { member: target.name, isActive: body.isActive },
      })
    }

    if (body.password !== undefined) {
      await db.user.update({ where: { id }, data: { passwordHash: hashPassword(body.password) } })
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "user.password_reset",
        entityType: "user",
        entityId: id,
        details: { member: target.name },
      })
    }

    invalidateCache("admin:users")

    return ok({ id })
  })
}

/**
 * Supprime DÉFINITIVEMENT un membre du staff.
 *
 * Garde-fous : acteur OWNER uniquement ; interdits absolus = soi-même, le
 * compte OWNER initial, tout compte CLIENT (via « Clients » uniquement).
 * Les notes internes RÉDIGÉES par ce membre sont réattribuées au Propriétaire
 * (la relation CustomerNote.author est obligatoire) ; l'historique d'activité
 * est conservé (actorId → NULL).
 */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("users.manage")
    if (actor.role !== "OWNER") {
      throw new ApiError("Seul le compte Propriétaire peut supprimer un membre de l'équipe.", 403)
    }
    const { id } = await params

    if (id === actor.id) {
      throw new ApiError("Vous ne pouvez pas supprimer votre propre compte.", 409)
    }
    const target = await db.user.findUnique({ where: { id } })
    if (!target) throw new ApiError("Membre introuvable.", 404)
    if (target.role === "CUSTOMER") {
      throw new ApiError("Les clients se suppriment depuis la page « Clients (CRM) ».", 409)
    }
    if (target.role === "OWNER") {
      throw new ApiError("Le compte Propriétaire initial ne peut pas être supprimé.", 409)
    }

    await db.$transaction(async (tx) => {
      // Réattribution des notes internes rédigées par ce membre (FK obligatoire).
      await tx.customerNote.updateMany({ where: { authorId: id }, data: { authorId: actor.id } })
      await tx.user.delete({ where: { id } })
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "user.delete",
      entityType: "user",
      entityId: id,
      details: { member: target.name, email: target.email, role: target.role },
    })

    invalidateCache("admin:users")

    return ok({ id, message: `Membre « ${target.name} » supprimé définitivement.` })
  })
}
