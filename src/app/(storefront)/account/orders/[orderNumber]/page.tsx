import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Gift, Package } from "lucide-react"
import { db } from "@/lib/db"
import { requireUserPage } from "@/components/storefront/account-guard"
import { loadOrderDetails, OrderDetails, type LinkedOrderDto } from "@/components/storefront/order-details"
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/storefront/status-badge"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Détail de la commande" }

/** Détail d'une commande dans l'espace client — accès strictement propriétaire. */
export default async function AccountOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>
}) {
  const { orderNumber } = await params
  const user = await requireUserPage(`/account/orders/${orderNumber}`)

  const order = await db.order.findUnique({ where: { orderNumber } })
  if (!order || order.userId !== user.id) notFound()

  const data = await loadOrderDetails(order.id)
  if (!data) notFound()

  const children = await db.order.findMany({
    where: { upsellParentOrderId: order.id },
    orderBy: { createdAt: "asc" },
    include: { items: true },
  })
  const linked: LinkedOrderDto[] = children.map((child) => ({
    orderNumber: child.orderNumber,
    orderStatus: child.orderStatus,
    paymentStatus: child.paymentStatus,
    total: child.total,
    itemsCount: child.items.reduce((s, i) => s + i.quantity, 0),
    url: `/account/orders/${child.orderNumber}`,
  }))

  const parent = order.upsellParentOrderId
    ? await db.order.findUnique({ where: { id: order.upsellParentOrderId }, select: { orderNumber: true } })
    : null

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
            <Link href="/account/orders">
              <ArrowLeft className="h-4 w-4" /> Mes commandes
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/catalogue">
              <Package className="h-4 w-4" /> Commander à nouveau
            </Link>
          </Button>
        </div>
        <div>
          <h1 className="font-mono text-xl font-extrabold tracking-wide sm:text-2xl">{data.orderNumber}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={data.orderStatus} />
            <PaymentStatusBadge status={data.paymentStatus} />
          </div>
        </div>
        {parent && (
          <p className="flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-soft/60 px-3 py-2 text-sm">
            <Gift className="h-4 w-4 shrink-0 text-brand-foreground" />
            Commande complémentaire de{" "}
            <Link href={`/account/orders/${parent.orderNumber}`} className="font-mono font-bold underline underline-offset-2">
              {parent.orderNumber}
            </Link>
          </p>
        )}
      </header>

      <OrderDetails data={data} linked={linked} />
    </div>
  )
}
