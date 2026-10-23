import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, queryInt, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache, cached } from "@/lib/cache"
import { ORDER_STATUSES, PAYMENT_STATUSES } from "@/lib/constants"

/** Liste des commandes avec filtres (statut, paiement, recherche) — permission orders.view. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireStaff("orders.view")
    const url = new URL(request.url)
    const status = url.searchParams.get("status")
    const payment = url.searchParams.get("payment")
    const q = url.searchParams.get("q")?.trim() ?? ""
    const take = Math.min(queryInt(request, "take", 300), 1000)

    if (status && !ORDER_STATUSES.includes(status as never)) throw new ApiError("Statut de commande inconnu.", 422)
    if (payment && !PAYMENT_STATUSES.includes(payment as never)) throw new ApiError("Statut de paiement inconnu.", 422)

    const where: Record<string, unknown> = {}
    if (status) where.orderStatus = status
    if (payment) where.paymentStatus = payment
    if (q) {
      where.OR = [
        { orderNumber: { contains: q } },
        { customerEmail: { contains: q } },
        { customerName: { contains: q } },
      ]
    }

    // Recherche textuelle : jamais cachée (clés non bornées + fraîcheur attendue).
    const cacheable = q === ""
    const cacheKey = `admin:orders:${status ?? ""}:${payment ?? ""}:${take}`
    const load = () =>
      Promise.all([
        db.order.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take,
          include: {
            _count: { select: { items: true } },
          },
        }),
        db.order.groupBy({ by: ["orderStatus"], _count: { id: true } }),
      ])

    const [orders, counts] = cacheable
      ? await cached(cacheKey, 15_000, load, 180_000)
      : await load()

    const statusCounts: Record<string, number> = {}
    let total = 0
    for (const g of counts) {
      statusCounts[g.orderStatus] = g._count.id
      total += g._count.id
    }

    return ok({
      total,
      statusCounts,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        userId: o.userId,
        city: o.city,
        itemsCount: o._count.items,
        total: o.total,
        amountPaid: o.amountPaid,
        couponCode: o.couponCode,
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
        paymentMethodLabel: o.paymentMethodLabel,
        shippingZoneName: o.shippingZoneName,
        createdAt: o.createdAt,
        upsellParentOrderId: o.upsellParentOrderId,
      })),
    })
  })
}

// ---------- Suppression multiple (sélection admin) — permission orders.delete ----------

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(300),
})

/**
 * Supprime plusieurs commandes sélectionnées.
 *
 * PROTECTION COMPTABLE : les commandes PAYÉES (paiement confirmé) ne peuvent
 * pas être supprimées — annulez ou remboursez-les d'abord. Les commandes en
 * attente/échouées/annulées/remboursées sont supprimées avec toutes leurs
 * dépendances (articles, événements, paiements, remboursements, utilisations
 * de coupons, acceptations d'upsell — cascades FK).
 */
export async function DELETE(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("orders.delete")
    const body = await parseBody(request, bulkDeleteSchema)
    const ids = [...new Set(body.ids)]

    const orders = await db.order.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        orderNumber: true,
        paymentStatus: true,
        amountPaid: true,
        amountRefunded: true,
        orderStatus: true,
      },
    })

    const blocked: { orderNumber: string; reason: string }[] = []
    const deletableIds: string[] = []
    // Récompenses de parrainage liées : la FK Reward.sourceOrder est Restrict —
    // ces commandes doivent être conservées (traçabilité des gains).
    const rewardsSources = new Set(
      (await db.reward.findMany({ where: { sourceOrderId: { in: ids } }, select: { sourceOrderId: true } }))
        .map((r) => r.sourceOrderId),
    )
    for (const o of orders) {
      if (rewardsSources.has(o.id)) {
        blocked.push({
          orderNumber: o.orderNumber,
          reason: "récompense de parrainage liée — traçabilité conservée",
        })
        continue
      }
      const paid = o.paymentStatus === "PAYMENT_PAID" || o.amountPaid > 0
      const refunded = o.paymentStatus === "PAYMENT_REFUNDED" || o.amountRefunded >= o.amountPaid
      if (paid && !refunded) {
        blocked.push({
          orderNumber: o.orderNumber,
          reason: "paiement confirmé — annulez ou remboursez avant suppression",
        })
      } else {
        deletableIds.push(o.id)
      }
    }

    let deleted = 0
    if (deletableIds.length > 0) {
      const res = await db.order.deleteMany({ where: { id: { in: deletableIds } } })
      deleted = res.count
    }

    const unknown = ids.length - orders.length
    if (deleted > 0) {
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "order.bulk_delete",
        entityType: "order",
        entityId: deletableIds.join(","),
        details: { deleted, blocked: blocked.map((b) => b.orderNumber) },
      })
      invalidateCache("admin:orders")
      invalidateCache("admin:customers")
      invalidateCache("admin:dashboard")
      invalidateCache("admin:analytics")
    }

    if (deleted === 0) {
      throw new ApiError(
        blocked.length > 0
          ? `Aucune commande supprimée. ${blocked[0].orderNumber} : ${blocked[0].reason}.`
          : "Aucune commande supprimée : sélection introuvable.",
        409,
      )
    }

    return ok({
      deleted,
      blocked,
      notFound: unknown > 0 ? unknown : 0,
      message:
        blocked.length > 0
          ? `${deleted} supprimée(s). ${blocked.length} bloquée(s) : ${blocked.map((b) => b.orderNumber).join(", ")}.`
          : `${deleted} commande(s) supprimée(s).`,
    })
  })
}
