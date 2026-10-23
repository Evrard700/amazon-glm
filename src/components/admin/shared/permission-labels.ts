import type { Permission } from "@/lib/constants"

/** Libellés français des permissions (page Rôles & détails journal). */
export const PERMISSION_LABELS: Record<string, string> = {
  "dashboard.view": "Voir le tableau de bord",
  "orders.view": "Voir les commandes",
  "orders.manage": "Gérer les commandes",
  "orders.delete": "Supprimer des commandes",
  "products.view": "Voir les produits",
  "products.manage": "Gérer les produits",
  "products.delete": "Supprimer des produits",
  "inventory.manage": "Gérer l'inventaire",
  "customers.view": "Voir les clients",
  "customers.manage": "Gérer les clients",
  "customers.delete": "Supprimer des clients",
  "coupons.manage": "Gérer les coupons",
  "promotions.manage": "Gérer les promotions X→Y",
  "referrals.manage": "Gérer le parrainage",
  "rewards.manage": "Gérer les récompenses",
  "upsells.manage": "Gérer les upsells",
  "campaigns.manage": "Gérer les campagnes",
  "reviews.moderate": "Modérer les avis",
  "storefront.edit": "Éditer les pages vitrine",
  "theme.edit": "Éditer le thème",
  "settings.manage": "Gérer les paramètres",
  "payments.confirm": "Confirmer les paiements",
  "refunds.approve": "Approuver les remboursements",
  "users.view": "Voir les utilisateurs",
  "users.manage": "Gérer les utilisateurs",
  "analytics.view": "Voir les statistiques",
  "activity.view": "Voir le journal d'activité",
}

export function permissionLabel(p: Permission | string): string {
  return PERMISSION_LABELS[p] ?? p
}
