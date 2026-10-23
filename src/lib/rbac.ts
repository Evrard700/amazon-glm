import type { Permission } from "@/lib/constants"
import { cached, invalidateCache } from "@/lib/cache"
import { parseJson } from "@/lib/json"
import { db } from "@/lib/db"
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, EDITABLE_ROLES, permissionsOf, hasPermission } from "@/lib/rbac-defaults"

export type { Permission } from "@/lib/constants"
export {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  EDITABLE_ROLES,
  permissionsOf,
  hasPermission,
}
export type { EditableRole } from "@/lib/rbac-defaults"

/**
 * RBAC SERVEUR — source de vérité des permissions.
 *
 * DEUX niveaux :
 *  1. DEFAULT_ROLE_PERMISSIONS (@/lib/rbac-defaults) : valeurs sûres compilées ;
 *  2. Surcharges éventuelles en base (model RoleConfig) que le Propriétaire
 *     édite depuis la console (page Rôles & permissions).
 *
 * Règles inviolables :
 *  - OWNER possède TOUJOURS toutes les permissions (ligne non éditable) ;
 *  - CUSTOMER n'en possède JAMAIS ;
 *  - une surcharge ne peut contenir que des permissions valides.
 */
export const RBAC_OVERRIDE_CACHE_KEY = "rbac:overrides"

/** Toutes les surcharges { rôle -> permissions } définies en base (cache 5 s). */
async function loadOverrides(): Promise<Record<string, Permission[]>> {
  const rows = await cached(
    RBAC_OVERRIDE_CACHE_KEY,
    5_000,
    () => db.roleConfig.findMany(),
    30_000,
  )
  const result: Record<string, Permission[]> = {}
  for (const row of rows) {
    const perms = parseJson<Permission[]>(row.permissionsJson, []).filter(
      (p) => (ALL_PERMISSIONS as string[]).includes(p),
    )
    result[row.key] = perms
  }
  return result
}

/**
 * Permissions EFFECTIVES d'un rôle (surcharge éditable, sinon défauts).
 * OWNER → tout, CUSTOMER → rien, quelles que soient les surcharges.
 */
export async function permissionsOfAsync(role: string): Promise<Permission[]> {
  if (role === "OWNER") return ALL_PERMISSIONS
  if (role === "CUSTOMER") return []
  const defaults = DEFAULT_ROLE_PERMISSIONS[role]
  if (!defaults) return []
  try {
    const overrides = await loadOverrides()
    const custom = overrides[role]
    return custom ?? defaults
  } catch {
    // Base indisponible : on sert les défauts (jamais d'élargissement implicite).
    return defaults
  }
}

/** Vérification asynchrone utilisée par requireStaff() — source de vérité serveur. */
export async function hasPermissionAsync(role: string, permission: Permission): Promise<boolean> {
  const perms = await permissionsOfAsync(role)
  return perms.includes(permission)
}

/** Applique une surcharge (upsert) et invalide le cache — usage API roles. */
export async function saveRolePermissions(role: string, permissions: Permission[], actorId: string): Promise<void> {
  await db.roleConfig.upsert({
    where: { key: role },
    update: { permissionsJson: JSON.stringify(permissions), updatedById: actorId },
    create: { key: role, permissionsJson: JSON.stringify(permissions), updatedById: actorId },
  })
  invalidateCache(RBAC_OVERRIDE_CACHE_KEY)
}

/** Supprime la surcharge d'un rôle (retour aux défauts) et invalide le cache. */
export async function resetRolePermissions(role: string): Promise<void> {
  await db.roleConfig.deleteMany({ where: { key: role } })
  invalidateCache(RBAC_OVERRIDE_CACHE_KEY)
}
