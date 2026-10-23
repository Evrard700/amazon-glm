// ============================================================
// Constantes métier — Téranga Market (validées par Zod côté serveur)
// SQLite n'a pas d'enum : ces listes font foi.
// ============================================================

export const ROLES = ["OWNER", "ADMIN", "MANAGER", "MARKETING", "STAFF", "CUSTOMER"] as const
export type Role = (typeof ROLES)[number]
export const STAFF_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "MARKETING", "STAFF"]

export const PERMISSIONS = [
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
] as const
export type Permission = (typeof PERMISSIONS)[number]

// Statuts de commande
export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

// Statuts de paiement (séparés des statuts de commande)
export const PAYMENT_STATUSES = [
  "PAYMENT_PENDING",
  "PAYMENT_PAID",
  "PAYMENT_FAILED",
  "PAYMENT_CANCELLED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const REWARD_STATUSES = [
  "REWARD_PENDING",
  "REWARD_APPROVED",
  "REWARD_AVAILABLE",
  "REWARD_USED",
  "REWARD_PAID",
  "REWARD_CANCELLED",
] as const
export type RewardStatus = (typeof REWARD_STATUSES)[number]

export const PRODUCT_TYPES = ["PHYSICAL", "DIGITAL", "HYBRID"] as const
export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const

export const COUPON_TYPES = ["PERCENT", "FIXED", "FREE_SHIPPING", "FREE_PRODUCT"] as const
export const PROMOTION_RULES = [
  "BUY_X_GET_Y_SAME",
  "BUY_X_GET_PRODUCT_FREE",
  "BUY_X_GET_PRODUCT_DISCOUNT",
] as const
export const UPSALE_TRIGGER_TYPES = ["PRODUCT", "CATEGORY", "ORDER_AMOUNT"] as const
export const REWARD_MODES = ["STORE_CREDIT", "COUPON", "MANUAL"] as const

// ---------- Libellés français (UI) ----------
export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propriétaire",
  ADMIN: "Administrateur",
  MANAGER: "Responsable",
  MARKETING: "Marketing",
  STAFF: "Personnel",
  CUSTOMER: "Client",
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmée",
  PROCESSING: "En préparation",
  SHIPPED: "Expédiée",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
  REFUNDED: "Remboursée",
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PAYMENT_PENDING: "Paiement en attente",
  PAYMENT_PAID: "Payée",
  PAYMENT_FAILED: "Paiement échoué",
  PAYMENT_CANCELLED: "Paiement annulé",
  PAYMENT_REFUNDED: "Remboursée",
  PAYMENT_PARTIALLY_REFUNDED: "Partiellement remboursée",
}

export const REWARD_STATUS_LABELS: Record<string, string> = {
  REWARD_PENDING: "En attente de validation",
  REWARD_APPROVED: "Validée",
  REWARD_AVAILABLE: "Disponible",
  REWARD_USED: "Utilisée",
  REWARD_PAID: "Payée (remboursement manuel)",
  REWARD_CANCELLED: "Annulée",
}

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  PHYSICAL: "Produit physique",
  DIGITAL: "Produit numérique",
  HYBRID: "Hybride (physique + numérique)",
}

export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  ACTIVE: "Publié",
  ARCHIVED: "Archivé",
}

export const COUPON_TYPE_LABELS: Record<string, string> = {
  PERCENT: "Pourcentage",
  FIXED: "Montant fixe",
  FREE_SHIPPING: "Livraison offerte",
  FREE_PRODUCT: "Produit offert",
}

export const PROMOTION_RULE_LABELS: Record<string, string> = {
  BUY_X_GET_Y_SAME: "Achetez X, les Y moins chers offerts (même sélection)",
  BUY_X_GET_PRODUCT_FREE: "Achetez X, recevez un produit offert",
  BUY_X_GET_PRODUCT_DISCOUNT: "Achetez X, réduction sur un produit proposé",
}

export const REFUND_MODE_LABELS: Record<string, string> = {
  STORE_CREDIT: "Crédit boutique",
  MANUAL: "Remboursement manuel (externe)",
}

export function orderStatusColor(status: string): string {
  switch (status) {
    case "PENDING":
      return "bg-amber-100 text-amber-800 border-amber-200"
    case "CONFIRMED":
    case "PROCESSING":
      return "bg-emerald-100 text-emerald-800 border-emerald-200"
    case "SHIPPED":
      return "bg-sky-100 text-sky-800 border-sky-200"
    case "DELIVERED":
      return "bg-green-100 text-green-800 border-green-200"
    case "CANCELLED":
      return "bg-neutral-100 text-neutral-600 border-neutral-200"
    case "REFUNDED":
      return "bg-rose-100 text-rose-700 border-rose-200"
    default:
      return "bg-neutral-100 text-neutral-600 border-neutral-200"
  }
}

export function paymentStatusColor(status: string): string {
  switch (status) {
    case "PAYMENT_PAID":
      return "bg-emerald-100 text-emerald-800 border-emerald-200"
    case "PAYMENT_PENDING":
      return "bg-amber-100 text-amber-800 border-amber-200"
    case "PAYMENT_FAILED":
    case "PAYMENT_CANCELLED":
      return "bg-rose-100 text-rose-700 border-rose-200"
    case "PAYMENT_REFUNDED":
    case "PAYMENT_PARTIALLY_REFUNDED":
      return "bg-orange-100 text-orange-700 border-orange-200"
    default:
      return "bg-neutral-100 text-neutral-600 border-neutral-200"
  }
}
