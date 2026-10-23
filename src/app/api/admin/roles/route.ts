import { z } from "zod"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  EDITABLE_ROLES,
  permissionsOfAsync,
  resetRolePermissions,
  saveRolePermissions,
} from "@/lib/rbac"
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/constants"
import type { Permission } from "@/lib/constants"

/**
 * Rôles & permissions — matrice personnalisable par le Propriétaire.
 *
 * - GET  (users.view)  : matrice effective complète (défauts + surcharges).
 * - PUT  (users.manage, OWNER uniquement) : définit les permissions d'un rôle
 *        éditable (ADMIN, MANAGER, MARKETING, STAFF).
 * - DELETE (users.manage, OWNER uniquement) : réinitialise un rôle sur ses
 *        valeurs par défaut.
 *
 * Garde-fous inviolables : OWNER = tout (non éditable), CUSTOMER = rien,
 * permissions restreintes à la liste officielle, "users.manage" réservé au
 * OWNER (la matrice ne peut jamais conférer la gestion des utilisateurs à
 * un rôle non-propriétaire).
 */
export async function GET() {
  return handle(async () => {
    await requireStaff("users.view")
    const roles = await Promise.all(
      STAFF_ROLES.map(async (role) => ({
        role,
        label: ROLE_LABELS[role],
        editable: (EDITABLE_ROLES as readonly string[]).includes(role),
        isOwner: role === "OWNER",
        permissions: await permissionsOfAsync(role),
        defaults: DEFAULT_ROLE_PERMISSIONS[role] ?? [],
      })),
    )
    return ok({ roles, allPermissions: ALL_PERMISSIONS })
  })
}

const putSchema = z.object({
  role: z.enum(EDITABLE_ROLES),
  permissions: z.array(z.string()).max(ALL_PERMISSIONS.length),
})

export async function PUT(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("users.manage")
    if (actor.role !== "OWNER") {
      throw new ApiError("Seul le compte Propriétaire peut modifier la matrice des permissions.", 403)
    }
    const body = await parseBody(request, putSchema)

    // Validation stricte : uniquement des permissions officielles existantes,
    // sans doublons. users.manage est retiré silencieusement : ce droit ne
    // peut jamais être conféré à un rôle autre que Propriétaire.
    const valid = new Set<string>(ALL_PERMISSIONS)
    const perms = [...new Set(body.permissions)].filter((p) => valid.has(p)) as Permission[]
    const sanitized = perms.filter((p) => p !== "users.manage")

    await saveRolePermissions(body.role, sanitized, actor.id)

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "role.permissions_update",
      entityType: "role",
      entityId: body.role,
      details: { role: body.role, permissions: sanitized },
    })

    // La matrice influence la navigation et les gardes de tout le staff.
    invalidateCache()

    return ok({ role: body.role, permissions: sanitized })
  })
}

const deleteSchema = z.object({
  role: z.enum(EDITABLE_ROLES),
})

export async function DELETE(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("users.manage")
    if (actor.role !== "OWNER") {
      throw new ApiError("Seul le compte Propriétaire peut réinitialiser la matrice.", 403)
    }
    const body = await parseBody(request, deleteSchema)
    await resetRolePermissions(body.role)

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "role.permissions_reset",
      entityType: "role",
      entityId: body.role,
      details: { role: body.role },
    })

    invalidateCache()
    return ok({ role: body.role, permissions: DEFAULT_ROLE_PERMISSIONS[body.role] ?? [] })
  })
}
