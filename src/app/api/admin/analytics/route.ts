import { db } from "@/lib/db"
import { ok, handle } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { cached } from "@/lib/cache"

/** Statistiques avancées — chaque chiffre est calculé depuis des données réelles.
 *  Agrégats lourds sur la base distante : cache mémoire 60 s, purgé à chaque
 *  mutation de commande (paiement confirmé, statut, remboursement). */
export async function GET(request: Request) {
  return handle(async () => {
    await requireStaff("analytics.view")
    const url = new URL(request.url)
    const days = Math.min(365, Math.max(1, Number.parseInt(url.searchParams.get("days") ?? "30", 10)))
    const since = new Date(Date.now() - days * 24 * 3600 * 1000)

    return ok(await cached(`admin:analytics:${days}`, 60_000, () => loadAnalytics(days, since), 600_000))
  })
}

async function loadAnalytics(days: number, since: Date) {
    // Salve 1 — lectures indépendantes en parallèle (commandes payées,
    // top produits, croissance clients, coupons, récompenses, upsells,
    // catégories et liaisons produit↔catégorie).
    const [paidOrders, topProducts, clientsGrowth, redemptions, rewards, acceptances, categories, allLinks] =
      await Promise.all([
        db.order.findMany({
          where: { paymentStatus: "PAYMENT_PAID", orderStatus: { notIn: ["CANCELLED"] }, paidAt: { gte: since } },
          select: { id: true, subtotal: true, total: true, createdAt: true, paidAt: true, referrerId: true, couponCode: true, userId: true },
        }),
        db.product.findMany({
          where: { deletedAt: null },
          orderBy: { salesCount: "desc" },
          take: 8,
          select: { id: true, name: true, slug: true, salesCount: true, price: true, salePrice: true, imagesJson: true, stock: true },
        }),
        db.user.groupBy({
          by: ["createdAt"],
          where: { role: "CUSTOMER", createdAt: { gte: since } },
          _count: { _all: true },
        }),
        db.couponRedemption.findMany({
          where: { createdAt: { gte: since } },
          select: { couponId: true },
        }),
        db.reward.findMany({
          where: { createdAt: { gte: since } },
          select: { program: true, status: true, amount: true },
        }),
        db.upsellAcceptance.count({ where: { createdAt: { gte: since } } }),
        db.category.findMany({ select: { id: true, name: true } }),
        // Toutes les liaisons produit↔catégorie (petite table) — filtrées
        // en mémoire ci-dessous, comme le faisait la requête `in: productIds`.
        db.productCategory.findMany({ select: { productId: true, categoryId: true } }),
      ])

    const paidOrderIds = paidOrders.map((o) => o.id)
    const couponIds = [...new Set(redemptions.map((r) => r.couponId))]

    // Salve 2 — lignes de commande (dépend de paidOrderIds) + coupons utilisés.
    const [items, couponRows] = await Promise.all([
      db.orderItem.findMany({ where: { orderId: { in: paidOrderIds } }, select: { productId: true, lineTotal: true, quantity: true, isFreeItem: true } }),
      couponIds.length > 0
        ? db.coupon.findMany({ where: { id: { in: couponIds } }, select: { id: true, code: true } })
        : Promise.resolve([] as { id: string; code: string }[]),
    ])

    const productIds = new Set(items.map((i) => i.productId))
    const links = allLinks.filter((l) => productIds.has(l.productId))
    const catName = new Map(categories.map((c) => [c.id, c.name]))
    const revenueByCategory = new Map<string, { name: string; revenue: number; units: number }>()
    for (const item of items) {
      if (item.isFreeItem) continue
      for (const link of links.filter((l) => l.productId === item.productId)) {
        const entry = revenueByCategory.get(link.categoryId) ?? { name: catName.get(link.categoryId) ?? "Sans catégorie", revenue: 0, units: 0 }
        entry.revenue += item.lineTotal
        entry.units += item.quantity
        revenueByCategory.set(link.categoryId, entry)
      }
    }

    // Top produits (toutes périodes confondues via salesCount + CA période)
    const revenuePerProduct = new Map<string, number>()
    for (const item of items) {
      if (item.isFreeItem) continue
      revenuePerProduct.set(item.productId, (revenuePerProduct.get(item.productId) ?? 0) + item.lineTotal)
    }

    // Croissance clients (inscriptions par jour sur la période) — depuis la salve 1
    const perDayClients = new Map<string, number>()
    for (const row of clientsGrowth) {
      const key = row.createdAt.toISOString().slice(0, 10)
      perDayClients.set(key, (perDayClients.get(key) ?? 0) + row._count._all)
    }

    // Coupons utilisés sur la période
    const couponName = new Map(couponRows.map((c) => [c.id, c.code]))

    // Parrainage : CA des commandes avec parrain + commissions accordées
    const referredRevenue = paidOrders.filter((o) => o.referrerId).reduce((s, o) => s + o.subtotal, 0)
    const commissionGranted = rewards.filter((r) => r.program === "COMMISSION" && r.status !== "REWARD_CANCELLED").reduce((s, r) => s + r.amount, 0)
    const fullRefundGranted = rewards.filter((r) => r.program === "FULL_REFUND" && r.status !== "REWARD_CANCELLED").reduce((s, r) => s + r.amount, 0)

    // Upsells : taux d'acceptation sur la période
    const eligiblePaidOrders = paidOrders.length // approximation honnête : chaque commande payée est une opportunité d'affichage si une offre matche
    const upsellRate = eligiblePaidOrders > 0 ? Math.round((acceptances / eligiblePaidOrders) * 100) : 0

    // CA par jour (pour graphique)
    const perDay = new Map<string, number>()
    for (const o of paidOrders) {
      const key = (o.paidAt ?? o.createdAt).toISOString().slice(0, 10)
      perDay.set(key, (perDay.get(key) ?? 0) + o.total)
    }

    return {
      period: { days, since },
      revenueByCategory: Array.from(revenueByCategory.entries())
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.revenue - a.revenue),
      topProducts: topProducts.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: p.price,
        salePrice: p.salePrice,
        stock: p.stock,
        salesCount: p.salesCount,
        revenue: revenuePerProduct.get(p.id) ?? 0,
        images: JSON.parse(p.imagesJson || "[]"),
      })),
      perDayRevenue: Array.from(perDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, revenue]) => ({ date, revenue })),
      perDayClients: Array.from(perDayClients.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
      couponUsage: couponRows
        .map((c) => ({ code: c.code, count: redemptions.filter((r) => r.couponId === c.id).length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      referral: { referredRevenue, commissionGranted, fullRefundGranted, ordersWithReferrer: paidOrders.filter((o) => o.referrerId).length },
      upsell: { acceptances, eligiblePaidOrders, rate: upsellRate, note: "Taux = acceptations / commandes payées de la période (une commande n'affiche une offre que si une règle de ciblage matche)." },
    }
}
