import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, queryInt, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { cached } from "@/lib/cache"
import { logActivity } from "@/lib/activity"
import { processDueRewards } from "@/lib/services/referrals"
import { dayKey } from "@/components/admin/shared/format"

const querySchema = z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]) })

function pct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return Math.round(((current - previous) / previous) * 100)
}

/**
 * Statistiques du tableau de bord — chiffres RÉELS via Prisma aggregate/groupBy.
 * Période sélectionnable : 7/30/90/365 jours, comparée à la période précédente équivalente.
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireStaff("dashboard.view")

    const url = new URL(request.url)
    const parsed = querySchema.safeParse({ days: queryInt(request, "days", 7) })
    if (!parsed.success) throw new ApiError("Période invalide (7, 30, 90 ou 365 jours).", 422)
    const days = parsed.data.days

    // Récompenses arrivées à échéance : mûrissement paresseux HORS cache —
    // il tourne à chaque visite du dashboard, même quand les stats sont
    // servies depuis le cache mémoire (30 s).
    void processDueRewards().catch((error) => console.error("[dashboard] processDueRewards", error))

    const stats = await cached(`admin:dashboard:${days}`, 30_000, async () => {
    const now = new Date()
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const prevStart = new Date(periodStart.getTime() - days * 24 * 60 * 60 * 1000)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const paidWhere = { paymentStatus: "PAYMENT_PAID" as const, paidAt: { gte: periodStart, lte: now } }
    const paidWherePrev = { paymentStatus: "PAYMENT_PAID" as const, paidAt: { gte: prevStart, lt: periodStart } }

    const [settings, recurrent, recurrentPrevRows] = await Promise.all([
      db.storeSettings.findUniqueOrThrow({ where: { id: 1 } }),
      db.order.groupBy({
        by: ["userId"],
        where: paidWhere,
        _count: { id: true },
      }),
      db.order.groupBy({
        by: ["userId"],
        where: paidWherePrev,
        _count: { id: true },
      }),
    ])
    const lowStockThreshold = settings.lowStockThreshold
    const recurrentCount = recurrent.filter((g) => g._count.id >= 2 && g.userId).length
    const recurrentPrevCount = recurrentPrevRows.filter((g) => g._count.id >= 2 && g.userId).length

    const [
      revenueAgg,
      revenueAggPrev,
      paidOrdersCount,
      paidOrdersCountPrev,
      ordersCount,
      ordersCountPrev,
      pendingOrders,
      pendingPayments,
      outOfStock,
      lowStock,
      newCustomers,
      newCustomersPrev,
      couponRedemptions,
      couponRedemptionsPrev,
      upsellAcceptances,
      upsellAcceptancesPrev,
      pendingRewards,
      abandonedCarts,
      paidOrdersPeriod,
      topProducts,
      lastOrders,
      pendingReviews,
    ] = await Promise.all([
      db.order.aggregate({ where: paidWhere, _sum: { amountPaid: true } }),
      db.order.aggregate({ where: paidWherePrev, _sum: { amountPaid: true } }),
      db.order.count({ where: paidWhere }),
      db.order.count({ where: paidWherePrev }),
      db.order.count({ where: { createdAt: { gte: periodStart, lte: now } } }),
      db.order.count({ where: { createdAt: { gte: prevStart, lt: periodStart } } }),
      db.order.count({ where: { orderStatus: "PENDING" } }),
      db.order.count({ where: { paymentStatus: "PAYMENT_PENDING", orderStatus: { not: "CANCELLED" } } }),
      db.product.count({ where: { deletedAt: null, type: { not: "DIGITAL" }, trackInventory: true, stock: { lte: 0 } } }),
      db.product.count({ where: { deletedAt: null, type: { not: "DIGITAL" }, trackInventory: true, stock: { gt: 0, lte: lowStockThreshold } } }),
      db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: periodStart, lte: now } } }),
      db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: prevStart, lt: periodStart } } }),
      db.couponRedemption.count({ where: { createdAt: { gte: periodStart, lte: now } } }),
      db.couponRedemption.count({ where: { createdAt: { gte: prevStart, lt: periodStart } } }),
      db.upsellAcceptance.count({ where: { createdAt: { gte: periodStart, lte: now } } }),
      db.upsellAcceptance.count({ where: { createdAt: { gte: prevStart, lt: periodStart } } }),
      db.reward.count({ where: { status: "REWARD_PENDING" } }),
      db.cart.count({ where: { status: "ACTIVE", lastActivityAt: { lt: oneHourAgo }, items: { some: {} } } }),
      db.order.findMany({
        where: paidWhere,
        select: { paidAt: true, amountPaid: true },
      }),
      db.product.findMany({
        where: { deletedAt: null },
        orderBy: { salesCount: "desc" },
        take: 5,
        select: { id: true, name: true, slug: true, salesCount: true, price: true, salePrice: true, imagesJson: true, type: true },
      }),
      db.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          total: true,
          orderStatus: true,
          paymentStatus: true,
          createdAt: true,
        },
      }),
      db.review.count({ where: { status: "PENDING" } }),
    ])

    const revenue = revenueAgg._sum.amountPaid ?? 0
    const revenuePrev = revenueAggPrev._sum.amountPaid ?? 0
    const avgBasket = paidOrdersCount > 0 ? Math.round(revenue / paidOrdersCount) : 0
    const avgBasketPrev = paidOrdersCountPrev > 0 ? Math.round(revenuePrev / paidOrdersCountPrev) : 0

    // CA par jour (bucket JS sur les commandes payées de la période)
    const buckets = new Map<string, number>()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      buckets.set(dayKey(d), 0)
    }
    for (const order of paidOrdersPeriod) {
      if (!order.paidAt) continue
      const key = dayKey(order.paidAt)
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + order.amountPaid)
    }
    const revenueByDay = Array.from(buckets.entries()).map(([day, amount]) => ({ day, amount }))

    return {
      days,
      lowStockThreshold,
      kpis: {
        revenue,
        revenueTrend: pct(revenue, revenuePrev),
        ordersCount,
        ordersTrend: pct(ordersCount, ordersCountPrev),
        avgBasket,
        avgBasketTrend: pct(avgBasket, avgBasketPrev),
        pendingOrders,
        pendingPayments,
        outOfStock,
        lowStock,
        newCustomers,
        newCustomersTrend: pct(newCustomers, newCustomersPrev),
        recurrentCustomers: recurrentCount,
        recurrentCustomersTrend: pct(recurrentCount, recurrentPrevCount),
        couponRedemptions,
        couponRedemptionsTrend: pct(couponRedemptions, couponRedemptionsPrev),
        pendingRewards,
        upsellAcceptances,
        upsellAcceptancesTrend: pct(upsellAcceptances, upsellAcceptancesPrev),
        abandonedCarts,
      },
      revenueByDay,
      topProducts: topProducts.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        salesCount: p.salesCount,
        price: p.salePrice ?? p.price,
        type: p.type,
        imagesJson: p.imagesJson,
      })),
      lastOrders,
      toTreat: {
        pendingOrders,
        pendingReviews,
      },
    }
    }, 300_000) // fin cached()

    return ok(stats)
  })
}
