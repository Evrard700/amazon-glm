import Link from "next/link"
import Image from "next/image"
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Gift,
  Home,
  Lock,
  MapPin,
  MessageSquare,
  Package,
  PackageCheck,
  RotateCcw,
  ShieldAlert,
  Truck,
  XCircle,
} from "lucide-react"
import { db } from "@/lib/db"
import { parseJson } from "@/lib/json"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/storefront/status-badge"
import { DownloadButton } from "@/components/storefront/download-button"

// ============================================================
// Détail de commande réutilisable :
//  - /order-confirmation/[orderNumber] (client connecté OU invité via token)
//  - /account/orders/[orderNumber] (espace client)
// Le chargement (DB) est serveur ; le rendu est présentational.
// ============================================================

export interface OrderItemDto {
  id: string
  productName: string
  productSlug: string
  variantName: string | null
  unitPrice: number
  quantity: number
  lineTotal: number
  isFreeItem: boolean
  freeLabel: string | null
  image: string | null
  digital: boolean
}

export interface OrderEventDto {
  id: string
  type: string
  message: string
  actorName: string | null
  createdAt: string
}

export interface OrderDownloadDto {
  grantId: string
  productName: string
  fileName: string | null
  used: number
  limit: number
  revoked: boolean
  revokedReason: string | null
}

export interface OrderDetailsData {
  orderNumber: string
  createdAt: string
  orderStatus: string
  paymentStatus: string
  customerName: string
  customerEmail: string
  customerPhone: string
  address: string
  city: string
  shippingZoneName: string | null
  shippingCost: number
  deliveryNote: string | null
  trackingNumber: string | null
  subtotal: number
  couponCode: string | null
  couponDiscount: number
  promotionDiscount: number
  promotions: { promotionId: string; name: string; amount: number; description: string }[]
  creditUsed: number
  total: number
  amountPaid: number
  paymentMethodLabel: string | null
  paymentMethodCode: string | null
  paymentInstructions: string | null
  items: OrderItemDto[]
  events: OrderEventDto[]
  downloads: OrderDownloadDto[]
  hasDigitalItems: boolean
}

export interface LinkedOrderDto {
  orderNumber: string
  orderStatus: string
  paymentStatus: string
  total: number
  itemsCount: number
  url: string
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" })
const shortDateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

export function formatDateFr(iso: string): string {
  return dateFmt.format(new Date(iso))
}

/** Construit le DTO complet d'une commande (usage serveur uniquement). */
export async function loadOrderDetails(orderId: string): Promise<OrderDetailsData | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, events: true },
  })
  if (!order) return null

  const productIds = Array.from(new Set(order.items.map((i) => i.productId)))
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } } })
    : []
  const productMap = new Map(products.map((p) => [p.id, p]))

  const method = order.paymentMethodId
    ? await db.paymentMethod.findUnique({ where: { id: order.paymentMethodId } })
    : null

  const grants = await db.digitalDownloadGrant.findMany({
    where: { orderItemId: { in: order.items.map((i) => i.id) } },
  })

  const promotionsSnapshot = parseJson<
    { promotionId: string; name: string; amount: number; description: string }[]
  >(order.promotionsJson, [])

  const items: OrderItemDto[] = order.items.map((item) => {
    const product = productMap.get(item.productId)
    const freeLabel = item.isFreeItem
      ? item.promotionId
        ? promotionsSnapshot.find((p) => p.promotionId === item.promotionId)?.name ?? "Promotion"
        : order.couponCode
          ? `Code ${order.couponCode}`
          : "Offert"
      : null
    return {
      id: item.id,
      productName: item.productName,
      productSlug: item.productSlug,
      variantName: item.variantName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      isFreeItem: item.isFreeItem,
      freeLabel,
      image: product ? (parseJson<string[]>(product.imagesJson, [])[0] ?? null) : null,
      digital: product ? product.type === "DIGITAL" || product.type === "HYBRID" : false,
    }
  })

  const downloads: OrderDownloadDto[] = grants.map((g) => {
    const item = order.items.find((i) => i.id === g.orderItemId)
    const product = item ? productMap.get(item.productId) : undefined
    return {
      grantId: g.id,
      productName: item?.productName ?? "Fichier",
      fileName: product?.digitalFileName ?? null,
      used: g.downloadCount,
      limit: g.limitCount,
      revoked: g.revoked,
      revokedReason: g.revokedReason,
    }
  })

  const hasDigitalItems = items.some((i) => i.digital)

  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    address: order.address,
    city: order.city,
    shippingZoneName: order.shippingZoneName,
    shippingCost: order.shippingCost,
    deliveryNote: order.deliveryNote,
    trackingNumber: order.trackingNumber,
    subtotal: order.subtotal,
    couponCode: order.couponCode,
    couponDiscount: order.couponDiscount,
    promotionDiscount: order.promotionDiscount,
    promotions: promotionsSnapshot,
    creditUsed: order.creditUsed,
    total: order.total,
    amountPaid: order.amountPaid,
    paymentMethodLabel: order.paymentMethodLabel,
    paymentMethodCode: order.paymentMethodCode,
    paymentInstructions: method?.instructions ?? null,
    items,
    events: order.events
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        actorName: e.actorName,
        createdAt: e.createdAt.toISOString(),
      })),
    downloads,
    hasDigitalItems,
  }
}

const eventIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  created: Package,
  confirmed: CheckCircle2,
  payment_confirmed: BadgeCheck,
  payment_failed: ShieldAlert,
  shipped: Truck,
  delivered: Home,
  cancelled: XCircle,
  refunded: RotateCcw,
  upsell_accepted: Gift,
  note: MessageSquare,
}

/** Bloc « Articles » de la commande (lignes offertes incluses). */
function ItemsCard({ data }: { data: OrderDetailsData }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-brand-foreground" />
          Vos articles
          <span className="text-sm font-normal text-muted-foreground">
            ({data.items.reduce((s, i) => s + i.quantity, 0)} article{data.items.reduce((s, i) => s + i.quantity, 0) > 1 ? "s" : ""})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3",
              item.isFreeItem && "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30",
            )}
          >
            <Link
              href={`/products/${item.productSlug}`}
              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-secondary/40"
              aria-hidden
            >
              {item.image ? (
                <Image src={item.image} alt="" fill sizes="64px" className="object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-muted-foreground">
                  <Package className="h-6 w-6" strokeWidth={1.5} />
                </span>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={`/products/${item.productSlug}`} className="truncate text-sm font-medium hover:underline">
                  {item.productName}
                </Link>
                {item.digital && (
                  <Badge variant="outline" className="text-[10px]">
                    Numérique
                  </Badge>
                )}
                {item.isFreeItem && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    <Gift className="h-3 w-3" /> Offert{item.freeLabel ? ` par ${item.freeLabel}` : ""}
                  </span>
                )}
              </div>
              {item.variantName && <p className="text-xs text-muted-foreground">{item.variantName}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {formatXOF(item.unitPrice)} × {item.quantity}
              </p>
            </div>
            <p className={cn("shrink-0 text-sm font-bold", item.isFreeItem && "text-emerald-700 dark:text-emerald-400")}>
              {item.lineTotal === 0 ? "Offert" : formatXOF(item.lineTotal)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** Bloc « Fichiers numériques » : débloqués uniquement après paiement confirmé. */
function DigitalCard({ data }: { data: OrderDetailsData }) {
  if (!data.hasDigitalItems) return null
  const paid = data.paymentStatus === "PAYMENT_PAID"

  if (!paid) {
    const cod = data.paymentMethodCode === "cash_on_delivery"
    return (
      <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
        <CardContent className="flex items-start gap-3 py-4">
          <span className="rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Vos fichiers numériques sont verrouillés</p>
            <p className="text-sm text-muted-foreground">
              Ils seront débloqués après confirmation du paiement
              {cod ? " — pour le paiement à la livraison : après réception et paiement du colis." : "."}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (data.downloads.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 py-4">
          <Lock className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">Fichiers numériques</p>
            <p className="text-sm text-muted-foreground">
              Cette commande invité ne peut pas porter d&apos;accès téléchargeable : créez un compte avec l&apos;adresse
              « {data.customerEmail} » puis contactez le support pour rattacher vos accès.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DownloadIcon className="h-4 w-4 text-brand-foreground" />
          Vos fichiers numériques
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.downloads.map((dl) => (
          <div key={dl.grantId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{dl.productName}</p>
              <p className="text-xs text-muted-foreground">
                {dl.fileName ? `${dl.fileName} — ` : ""}
                Téléchargements restants : {Math.max(0, dl.limit - dl.used)}/{dl.limit}
              </p>
              {dl.revoked && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                  <XCircle className="h-3 w-3" /> Accès révoqué{dl.revokedReason ? ` : ${dl.revokedReason}` : ""}
                </span>
              )}
            </div>
            {dl.revoked ? (
              <Badge variant="destructive">Indisponible</Badge>
            ) : (
              <DownloadButton grantId={dl.grantId} disabled={dl.used >= dl.limit} />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("h-4 w-4", className)} aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  )
}

/** Bloc « Suivi de la commande » : timeline verticale des événements (les plus récents en haut). */
function TimelineCard({ data }: { data: OrderDetailsData }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-brand-foreground" />
          Suivi de la commande
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun événement pour le moment.</p>
        ) : (
          <ol className="relative space-y-5 border-l pl-6">
            {data.events.map((event, index) => {
              const Icon = eventIcon[event.type] ?? Clock
              const isLatest = index === 0
              return (
                <li key={event.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full",
                      isLatest ? "bg-brand text-brand-foreground" : "bg-secondary text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm leading-snug">{event.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {shortDateFmt.format(new Date(event.createdAt))}
                    {event.actorName ? ` — par ${event.actorName}` : ""}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

/** Composant principal : réutilisé par la confirmation et l'espace client. */
export function OrderDetails({ data, linked }: { data: OrderDetailsData; linked?: LinkedOrderDto[] }) {
  return (
    <section aria-label={`Détail de la commande ${data.orderNumber}`} className="grid gap-4 lg:grid-cols-[1fr_380px] lg:gap-6">
      <div className="space-y-4 lg:space-y-6">
        <ItemsCard data={data} />
        <DigitalCard data={data} />
        {linked && linked.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gift className="h-4 w-4 text-brand-foreground" />
                Commandes complémentaires liées
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {linked.map((child) => (
                <div key={child.orderNumber} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-semibold">{child.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {child.itemsCount} article{child.itemsCount > 1 ? "s" : ""} — {formatXOF(child.total)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <OrderStatusBadge status={child.orderStatus} />
                    <PaymentStatusBadge status={child.paymentStatus} />
                    <Link
                      href={child.url}
                      className="text-sm font-semibold text-brand-foreground underline underline-offset-2 hover:opacity-80"
                    >
                      Voir le détail
                    </Link>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <TimelineCard data={data} />
      </div>

      <div className="space-y-4 lg:space-y-6">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-brand-foreground" />
              Récapitulatif
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Sous-total</span>
              <span>{formatXOF(data.subtotal)}</span>
            </div>
            {data.promotionDiscount > 0 && (
              <div className="flex justify-between font-medium text-emerald-600">
                <span>Promotions</span>
                <span>-{formatXOF(data.promotionDiscount)}</span>
              </div>
            )}
            {data.couponDiscount > 0 && (
              <div className="flex justify-between font-medium text-emerald-600">
                <span>Code {data.couponCode}</span>
                <span>-{formatXOF(data.couponDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Livraison{data.shippingZoneName ? ` (${data.shippingZoneName})` : ""}</span>
              <span>{data.shippingCost === 0 ? "Offerte" : formatXOF(data.shippingCost)}</span>
            </div>
            {data.creditUsed > 0 && (
              <div className="flex justify-between font-medium text-emerald-600">
                <span>Crédit boutique</span>
                <span>-{formatXOF(data.creditUsed)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>{formatXOF(data.total)}</span>
            </div>
            {data.amountPaid > 0 && (
              <p className="text-xs text-emerald-600">Déjà réglé : {formatXOF(data.amountPaid)}</p>
            )}
            <div className="pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Moyen de paiement</p>
              <p className="text-sm">{data.paymentMethodLabel ?? "—"}</p>
              {data.paymentInstructions && (
                <p className="mt-1 rounded-md bg-brand-soft px-2.5 py-2 text-xs leading-relaxed text-brand-foreground">
                  {data.paymentInstructions}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-brand-foreground" />
              Livraison
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p className="font-medium">{data.customerName}</p>
            <p className="text-muted-foreground">{data.address}</p>
            <p className="text-muted-foreground">{data.city}</p>
            {data.shippingZoneName && (
              <p className="pt-1 text-xs text-muted-foreground">Zone : {data.shippingZoneName}</p>
            )}
            {data.trackingNumber && (
              <p className="pt-1 text-xs">
                <span className="font-semibold">N° de suivi :</span> {data.trackingNumber}
              </p>
            )}
            {data.deliveryNote && (
              <p className="mt-2 rounded-md border-dashed border px-2.5 py-2 text-xs italic text-muted-foreground">
                « {data.deliveryNote} »
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <PackageCheck className="h-4 w-4" />
          Commande passée le {formatDateFr(data.createdAt)}
        </div>
      </div>
    </section>
  )
}
