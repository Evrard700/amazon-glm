import { db } from "@/lib/db"
import { ApiError } from "@/lib/api"
import { parseJson } from "@/lib/json"
import { hasPermissionAsync, type Permission } from "@/lib/rbac"
import type { User } from "@prisma/client"
import { requireStaff } from "@/lib/auth"

/**
 * Helpers partagés par les routes API marketing (Task 3-b).
 * Ce dossier `_lib` est privé (non routé par App Router).
 */

/**
 * Exige un membre du staff disposant d'AU MOINS UNE des permissions listées.
 * Le chargement du membre passe TOUJOURS par requireStaff() : session valide,
 * rôle rechargé depuis la base et matrice de permissions effective.
 */
export async function requireAnyPermission(
  permissions: Permission[],
): Promise<User> {
  const staff = await requireStaff()
  const hasOne = await Promise.all(permissions.map((p) => hasPermissionAsync(staff.role, p))).then((r) => r.some(Boolean))
  if (!hasOne) {
    throw new ApiError(
      "Accès refusé : permission insuffisante pour cette action.",
      403,
    )
  }
  return staff
}

/**
 * Sous-total éligible d'une commande selon des produits/catégories donnés.
 * Dupliqué en lecture seule depuis `@/lib/services/referrals` pour les
 * AFFICHAGES (progression remboursement, statistiques) — même définition
 * exacte que le moteur : lignes hors articles offerts, périmètre produit OU
 * catégorie, sinon tout le panier.
 */
export async function eligibleSubtotalOfOrder(
  orderId: string,
  eligibleProductIds: string[],
  eligibleCategoryIds: string[],
): Promise<number> {
  const items = await db.orderItem.findMany({ where: { orderId } })
  if (eligibleProductIds.length === 0 && eligibleCategoryIds.length === 0) {
    return items.filter((i) => !i.isFreeItem).reduce((s, i) => s + i.lineTotal, 0)
  }
  const scopedIds = new Set(eligibleProductIds)
  if (eligibleCategoryIds.length > 0) {
    const links = await db.productCategory.findMany({
      where: { categoryId: { in: eligibleCategoryIds } },
    })
    links.forEach((l) => scopedIds.add(l.productId))
  }
  return items
    .filter((i) => !i.isFreeItem && scopedIds.has(i.productId))
    .reduce((s, i) => s + i.lineTotal, 0)
}

/** Charge les périmètres éligibles (produits/catégories) d'un programme. */
export function parseScopes(
  eligibleProductIdsJson: string | null,
  eligibleCategoryIdsJson: string | null,
): { eligibleProductIds: string[]; eligibleCategoryIds: string[] } {
  return {
    eligibleProductIds: parseJson<string[]>(eligibleProductIdsJson, []),
    eligibleCategoryIds: parseJson<string[]>(eligibleCategoryIdsJson, []),
  }
}

/**
 * Segments d'audience des campagnes (mêmes valeurs que le champ Campaign.audienceJson).
 * TOUS_CLIENTS / CLIENTS_AVEC_COMMANDES / ABONNES_NEWSLETTER / AVEC_CREDIT.
 */
export const CAMPAIGN_SEGMENTS = [
  "TOUS_CLIENTS",
  "CLIENTS_AVEC_COMMANDES",
  "ABONNES_NEWSLETTER",
  "AVEC_CREDIT",
] as const
export type CampaignSegment = (typeof CAMPAIGN_SEGMENTS)[number]

/** Valeur stockée en DB (historique du schéma) ↔ segment lisible. */
export const SEGMENT_STORAGE: Record<CampaignSegment, string> = {
  TOUS_CLIENTS: "ALL",
  CLIENTS_AVEC_COMMANDES: "CUSTOMERS",
  ABONNES_NEWSLETTER: "SUBSCRIBERS",
  AVEC_CREDIT: "WITH_CREDIT",
}

/** Compte les destinataires d'un segment (lecture seule, honnête, aucun envoi). */
export async function countAudience(
  segment: CampaignSegment,
  minOrders: number,
): Promise<number> {
  switch (segment) {
    case "TOUS_CLIENTS":
      return db.user.count({ where: { role: "CUSTOMER", isActive: true } })
    case "CLIENTS_AVEC_COMMANDES": {
      const customers = await db.user.findMany({
        where: { role: "CUSTOMER", isActive: true },
        select: { id: true },
      })
      if (customers.length === 0) return 0
      const ids = customers.map((c) => c.id)
      const grouped = await db.order.groupBy({
        by: ["userId"],
        where: {
          userId: { in: ids },
          paymentStatus: "PAYMENT_PAID",
          orderStatus: { notIn: ["CANCELLED"] },
        },
        _count: { id: true },
      })
      return grouped.filter((g) => g._count.id >= Math.max(1, minOrders)).length
    }
    case "ABONNES_NEWSLETTER":
      return db.newsletterSubscriber.count()
    case "AVEC_CREDIT":
      return db.user.count({
        where: { role: "CUSTOMER", isActive: true, storeCredit: { gt: 0 } },
      })
  }
}

/** Génère un code lisible en majuscules (ex: RETOUR-4F9K2M). */
export function generateCouponCode(prefix: string, length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let suffix = ""
  for (let i = 0; i < length; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `${prefix}-${suffix}`
}

/** Conversion Date | null → valeur compatible input datetime-local. */
export function toLocalInput(date: Date | null | undefined): string {
  if (!date) return ""
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
