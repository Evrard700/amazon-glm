import type { Permission } from "@/lib/constants"

/**
 * MATRICE PAR DÉFAUT — module PUR (aucune import serveur) : utilisable côté
 * client pour l'affichage ET côté serveur comme base des permissions.
 *
 * La source de vérité SERVEUR (surcharges éditables par le Propriétaire)
 * vit dans @/lib/rbac (permissionsOfAsync / hasPermissionAsync) — ce module
 * ne sert QUE :
 *  - au rendu UI des menus/badges (par défauts),
 *  - de base par défaut pour les rôles sans personnalisation.
 *
 * Ne JAMAIS autoriser une action serveur sur la seule foi de hasPermission().
 */
export const ALL_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "orders.view",
  "orders.manage",
  "orders.delete",
  "products.view",
  "products.manage",
  "products.delete",
  "inventory.manage",
  "customers.view",
  "customers.manage",
  "customers.delete",
  "coupons.manage",
  "promotions.manage",
  "referrals.manage",
  "rewards.manage",
  "upsells.manage",
  "campaigns.manage",
  "reviews.moderate",
  "storefront.edit",
  "theme.edit",
  "settings.manage",
  "payments.confirm",
  "refunds.approve",
  "users.view",
  "users.manage",
  "analytics.view",
  "activity.view",
]

/** Rôles dont la matrice peut être personnalisée par le Propriétaire. */
export const EDITABLE_ROLES = ["ADMIN", "MANAGER", "MARKETING", "STAFF"] as const
export type EditableRole = (typeof EDITABLE_ROLES)[number]

export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  OWNER: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS.filter((p) => p !== "users.manage"),
  MANAGER: [
    "dashboard.view",
    "orders.view",
    "orders.manage",
    "products.view",
    "products.manage",
    "inventory.manage",
    "customers.view",
    "customers.manage",
    "analytics.view",
    "activity.view",
    "payments.confirm",
    "refunds.approve",
  ],
  MARKETING: [
    "dashboard.view",
    "coupons.manage",
    "promotions.manage",
    "referrals.manage",
    "rewards.manage",
    "upsells.manage",
    "campaigns.manage",
    "reviews.moderate",
    "storefront.edit",
    "theme.edit",
    "customers.view",
    "analytics.view",
  ],
  STAFF: [
    "dashboard.view",
    "orders.view",
    "products.view",
    "inventory.manage",
    "customers.view",
    "reviews.moderate",
  ],
  CUSTOMER: [],
}

/** Permissions PAR DÉFAUT d'un rôle (synchrone, sans DB — affichage uniquement). */
export function permissionsOf(role: string): Permission[] {
  return DEFAULT_ROLE_PERMISSIONS[role] ?? []
}

/** Vérification sur les DÉFAUTS — affichage uniquement, JAMAIS une autorisation serveur. */
export function hasPermission(role: string, permission: Permission): boolean {
  const perms = DEFAULT_ROLE_PERMISSIONS[role]
  if (!perms) return false
  return perms.includes(permission)
}
