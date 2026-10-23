import { db } from "@/lib/db"
import { requireStaff } from "@/lib/auth"
import { queryInt } from "@/lib/api"

/** Export CSV des commandes — permission orders.view (données déjà visibles). */
export async function GET(request: Request) {
  try {
    await requireStaff("orders.view")
    const take = Math.min(queryInt(request, "take", 1000), 2000)
    const orders = await db.order.findMany({
      orderBy: { createdAt: "desc" },
      take,
      include: { _count: { select: { items: true } } },
    })

    const esc = (v: string | number | null | undefined) => {
      const s = v === null || v === undefined ? "" : String(v)
      return `"${s.replace(/"/g, '""')}"`
    }
    const header = [
      "Numéro", "Date", "Client", "Email", "Téléphone", "Ville", "Articles",
      "Sous-total", "Remise coupon", "Remise promo", "Crédit utilisé", "Livraison",
      "Total", "Payé", "Remboursé", "Statut commande", "Statut paiement",
      "Moyen de paiement", "Code coupon",
    ]
    const lines = orders.map((o) =>
      [
        esc(o.orderNumber),
        esc(o.createdAt.toISOString()),
        esc(o.customerName),
        esc(o.customerEmail),
        esc(o.customerPhone),
        esc(o.city),
        o._count.items,
        o.subtotal,
        o.couponDiscount,
        o.promotionDiscount,
        o.creditUsed,
        o.shippingCost,
        o.total,
        o.amountPaid,
        o.amountRefunded,
        esc(o.orderStatus),
        esc(o.paymentStatus),
        esc(o.paymentMethodLabel),
        esc(o.couponCode),
      ].join(","),
    )
    const csv = "\uFEFF" + [header.join(","), ...lines].join("\r\n")

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="teranga-commandes-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return new Response("Accès refusé.", { status: 403 })
  }
}
