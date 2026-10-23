import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, queryInt, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache, cached } from "@/lib/cache"
import { parseJson } from "@/lib/json"

/**
 * Liste CRM des clients — permission customers.view.
 * Agrégats réels : commandes payées, total dépensé, filleuls, crédit.
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireStaff("customers.view")
    const url = new URL(request.url)
    const take = Math.min(queryInt(request, "take", 500), 1000)

    const [users, ordersAgg, referrals, reviewsAgg] = await cached(
      `admin:customers:${take}`,
      15_000,
      () =>
        Promise.all([
          db.user.findMany({
            where: { role: "CUSTOMER" },
            orderBy: { createdAt: "desc" },
            take,
          }),
          db.order.groupBy({
            by: ["userId"],
            where: { paymentStatus: "PAYMENT_PAID" },
            _count: { id: true },
            _sum: { amountPaid: true },
          }),
          db.user.groupBy({
            by: ["referredById"],
            where: { referredById: { not: null }, role: "CUSTOMER" },
            _count: { id: true },
          }),
          db.review.groupBy({
            by: ["userId"],
            where: { userId: { not: null } },
            _count: { id: true },
          }),
        ]),
      180_000,
    )

    const paidByUser = new Map(ordersAgg.map((g) => [g.userId, { count: g._count.id, total: g._sum.amountPaid ?? 0 }]))
    const referralsByUser = new Map(referrals.map((g) => [g.referredById, g._count.id]))
    const reviewsByUser = new Map(reviewsAgg.map((g) => [g.userId, g._count.id]))

    return ok(
      users.map((u) => {
        const paid = paidByUser.get(u.id)
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          city: u.city,
          paidOrdersCount: paid?.count ?? 0,
          totalSpent: paid?.total ?? 0,
          storeCredit: u.storeCredit,
          referredById: u.referredById,
          referralsCount: referralsByUser.get(u.id) ?? 0,
          reviewsCount: reviewsByUser.get(u.id) ?? 0,
          tags: parseJson<string[]>(u.crmTagsJson, []),
          marketingConsent: u.marketingConsent,
          isActive: u.isActive,
          referralCode: u.referralCode,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
        }
      }),
    )
  })
}

// ---------- Suppression multiple (sélection admin) — permission customers.delete ----------

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(300),
})

/**
 * Supprime plusieurs COMPTES CLIENTS sélectionnés.
 *
 * Intégrité : seuls les comptes de rôle CUSTOMER peuvent être supprimés ici
 * (le staff se gère dans « Utilisateurs » sous users.manage, OWNER uniquement).
 * L'historique commercial est PRÉSERVÉ : les commandes gardent leur snapshot
 * (userId → SetNull), les avis restent avec leur nom d'auteur, les activités
 * sont conservées. Récompenses/crédits/journalisés du client sont purgés
 * (cascades FK).
 */
export async function DELETE(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("customers.delete")
    const body = await parseBody(request, bulkDeleteSchema)
    const ids = [...new Set(body.ids)]

    const targets = await db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, role: true },
    })

    const deletable = targets.filter((u) => u.role === "CUSTOMER")
    const blocked = targets
      .filter((u) => u.role !== "CUSTOMER")
      .map((u) => ({ email: u.email, reason: "compte staff — supprimable uniquement depuis « Utilisateurs »" }))

    let deleted = 0
    if (deletable.length > 0) {
      // Les commandes sont détachées (userId → NULL) avant suppression pour
      // éviter tout accident de cascade : l'historique reste intact.
      const del = await db.$transaction(async (tx) => {
        await tx.order.updateMany({ where: { userId: { in: deletable.map((u) => u.id) } }, data: { userId: null } })
        return tx.user.deleteMany({ where: { id: { in: deletable.map((u) => u.id) }, role: "CUSTOMER" } })
      })
      deleted = del.count
    }

    if (deleted > 0) {
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "customer.bulk_delete",
        entityType: "user",
        entityId: deletable.map((u) => u.id).join(","),
        details: { deleted, names: deletable.map((u) => u.email) },
      })
      invalidateCache("admin:customers")
      invalidateCache("admin:orders")
      invalidateCache("admin:dashboard")
      invalidateCache("admin:analytics")
      invalidateCache("admin:users")
    }

    if (deleted === 0) {
      throw new ApiError(
        blocked.length > 0
          ? `Aucun compte supprimé. ${blocked[0].email} : ${blocked[0].reason}.`
          : "Aucun client supprimé : sélection introuvable.",
        409,
      )
    }

    return ok({
      deleted,
      blocked,
      notFound: ids.length - targets.length > 0 ? ids.length - targets.length : 0,
      message:
        blocked.length > 0
          ? `${deleted} compte(s) supprimé(s). ${blocked.length} non éligible(s) : ${blocked.map((b) => b.email).join(", ")}.`
          : `${deleted} compte(s) client supprimé(s) — historique de commandes conservé.`,
    })
  })
}
