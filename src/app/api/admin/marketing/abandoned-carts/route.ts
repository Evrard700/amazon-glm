import { db } from "@/lib/db"
import { ok, handle } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { parseJson } from "@/lib/json"
import { cached } from "@/lib/cache"

/**
 * GET /api/admin/marketing/abandoned-carts
 * Paniers ACTIFS inactifs depuis plus d'1 heure avec articles.
 * HONNÊTETÉ : aucun e-mail n'est envoyé automatiquement ; une « récupération »
 * ne compte comme vente QUE si une commande existe (convertedOrderId).
 */

const ONE_HOUR_MS = 60 * 60 * 1000

export async function GET() {
  return handle(async () => {
    await requireStaff("campaigns.manage")
    const cutoff = new Date(Date.now() - ONE_HOUR_MS)

    // Cache 15 s : cette vue fait un findMany lourd + sous-requ00eates.
    const carts = await cached(
      "admin:marketing:abandoned-carts",
      15_000,
      () =>
        db.cart.findMany({
        where: {
          status: "ACTIVE",
          lastActivityAt: { lt: cutoff },
          items: { some: {} },
        },
        orderBy: { lastActivityAt: "asc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              product: {
                select: { id: true, name: true, slug: true, price: true, salePrice: true, imagesJson: true },
              },
              variant: { select: { id: true, name: true, price: true } },
            },
          },
        },
      }),
      120_000,
    )

    const withConversion = await Promise.all(
      carts.map(async (cart) => {
        const convertedOrder = cart.convertedOrderId
          ? await db.order.findUnique({
              where: { id: cart.convertedOrderId },
              select: { id: true, orderNumber: true, total: true },
            })
          : null
        return { cart, convertedOrder }
      }),
    )

    const rows = withConversion.map(({ cart, convertedOrder }) => {
      const items = cart.items.map((i) => {
        const unitPrice = i.variant?.price ?? i.product.salePrice ?? i.product.price
        return {
          itemId: i.id,
          productId: i.product.id,
          name: i.product.name,
          slug: i.product.slug,
          variantName: i.variant?.name ?? null,
          quantity: i.quantity,
          unitPrice,
          lineTotal: unitPrice * i.quantity,
          image: parseJson<string[]>(i.product.imagesJson, [])[0] ?? null,
        }
      })
      return {
        id: cart.id,
        sessionToken: cart.sessionToken,
        customer: cart.user
          ? { id: cart.user.id, name: cart.user.name, email: cart.user.email }
          : null,
        isGuest: !cart.user,
        lastActivityAt: cart.lastActivityAt,
        createdAt: cart.createdAt,
        itemCount: items.reduce((s, i) => s + i.quantity, 0),
        items,
        estimatedValue: items.reduce((s, i) => s + i.lineTotal, 0),
        couponId: cart.couponId,
        recoveryCouponSentAt: cart.recoveryCouponSentAt,
        convertedOrder,
      }
    })

    const totalValue = rows.reduce((s, r) => s + r.estimatedValue, 0)

    return ok({
      stats: {
        abandonedCount: rows.length,
        totalValue,
        withAccount: rows.filter((r) => !r.isGuest).length,
        guests: rows.filter((r) => r.isGuest).length,
        converted: rows.filter((r) => r.convertedOrder).length,
        recoverySent: rows.filter((r) => r.recoveryCouponSentAt).length,
      },
      carts: rows.sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime()),
    })
  })
}
