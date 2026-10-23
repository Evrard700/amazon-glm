import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, Package, User } from "lucide-react"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { loadOrderDetails, OrderDetails, type LinkedOrderDto } from "@/components/storefront/order-details"
import { ThankYouUpsells } from "@/components/storefront/thank-you-upsells"
import { OrderSuccessHero } from "@/components/storefront/checkout-success"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Confirmation de commande" }

/**
 * PAGE DE REMERCIEMENT — accès si :
 *  - l'utilisateur connecté est le propriétaire de la commande, OU
 *  - le paramètre ?token= correspond au jeton d'accès invité de la commande.
 * Sinon 404 (on ne révèle pas l'existence de la commande).
 */
export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { orderNumber } = await params
  const { token } = await searchParams

  const order = await db.order.findUnique({ where: { orderNumber } })
  if (!order) notFound()

  const user = await getSessionUser()
  const isOwner = !!(user && order.userId && order.userId === user.id)
  const isGuestWithToken = !!token && token === order.accessToken
  if (!isOwner && !isGuestWithToken) notFound()

  const data = await loadOrderDetails(order.id)
  if (!data) notFound()

  // Commandes complémentaires liées (acceptations d'offres upsell)
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
    url: `/order-confirmation/${child.orderNumber}?token=${child.accessToken}`,
  }))

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">
      <div className="space-y-6">
        <OrderSuccessHero
          customerName={data.customerName}
          orderNumber={data.orderNumber}
          orderStatus={data.orderStatus}
          paymentStatus={data.paymentStatus}
          total={data.total}
          paymentMethodLabel={data.paymentMethodLabel}
        />

        {/* Offres exclusives post-commande — prix spécial appliqué par le serveur.
            token = preuve de propriété exigée par l'API upsell (anti-IDOR). */}
        {!order.upsellParentOrderId && <ThankYouUpsells orderId={order.id} token={order.accessToken} />}

        <OrderDetails data={data} linked={linked} />

        <div className="flex flex-wrap items-center justify-center gap-3 pb-4">
          {isOwner && (
            <Button asChild variant="outline" className="gap-1.5">
              <Link href="/account/orders">
                <Package className="h-4 w-4" /> Voir mes commandes
              </Link>
            </Button>
          )}
          {!user && (
            <Button asChild variant="outline" className="gap-1.5">
              <Link href={`/login?next=/account/orders`}>
                <User className="h-4 w-4" /> Suivre mes commandes (me connecter)
              </Link>
            </Button>
          )}
          <Button asChild className="gap-1.5 bg-brand text-brand-foreground hover:brightness-95">
            <Link href="/catalogue">
              Continuer mes achats <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
