"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ClipboardCopy,
  CreditCard,
  Gift,
  History,
  Loader2,
  Package,
  PackageCheck,
  Truck,
  Undo2,
  Wallet,
  XCircle,
} from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { useAdminApi } from "@/components/admin/api-client"
import { useMe } from "@/components/admin/shared/use-me"
import { OrderStatusBadge, PaymentStatusBadge, RefundStatusBadge, RewardStatusBadge } from "@/components/admin/shared/badges"
import { formatDateTime, formatRelative } from "@/components/admin/shared/format"
import { formatXOF } from "@/lib/money"
import { REFUND_MODE_LABELS } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface OrderDetail {
  order: {
    id: string
    orderNumber: string
    createdAt: string
    customer: { id: string; name: string; email: string; phone: string | null; city: string | null } | null
    customerName: string
    customerEmail: string
    customerPhone: string
    address: string
    city: string
    shippingZoneName: string | null
    shippingCost: number
    deliveryNote: string | null
    trackingNumber: string | null
    orderStatus: string
    paymentStatus: string
    subtotal: number
    couponCode: string | null
    couponDiscount: number
    promotionDiscount: number
    promotions: { promotionId: string; name: string; amount: number; description?: string }[]
    creditUsed: number
    total: number
    amountPaid: number
    amountRefunded: number
    paymentMethodCode: string | null
    paymentMethodLabel: string | null
    adminNote: string | null
    cancelledReason: string | null
    paidAt: string | null
    shippedAt: string | null
    deliveredAt: string | null
    cancelledAt: string | null
    upsellParentOrderId: string | null
    items: {
      id: string
      productId: string
      productName: string
      productSlug: string
      variantName: string | null
      sku: string | null
      unitPrice: number
      quantity: number
      lineTotal: number
      isFreeItem: boolean
      digitalGranted: boolean
      type: string
      image: string | null
      grants: { id: string; downloadCount: number; limitCount: number; revoked: boolean; revokedReason: string | null }[]
    }[]
    events: { id: string; type: string; message: string; actorName: string | null; createdAt: string }[]
    payments: {
      id: string
      provider: string
      methodLabel: string
      amount: number
      status: string
      reference: string | null
      failureReason: string | null
      confirmedAt: string | null
      confirmedBy: string | null
      createdAt: string
    }[]
    refunds: {
      id: string
      amount: number
      mode: string
      status: string
      reason: string
      note: string | null
      processedAt: string | null
      createdAt: string
    }[]
  }
  rewards: {
    id: string
    program: string
    amount: number
    status: string
    reason: string
    beneficiary: { id: string; name: string; email: string }
    createdAt: string
  }[]
  upsell: {
    parent: { id: string; orderNumber: string; total: number } | null
    children: { id: string; orderNumber: string; total: number; orderStatus: string; paymentStatus: string }[]
    acceptances: { id: string; offerName: string; acceptedPrice: number; createdAt: string }[]
  }
  coupon: { code: string; type: string; value: number } | null
}

function eventIcon(type: string) {
  if (type.includes("payment_confirmed")) return <BadgeCheck className="h-4 w-4 text-emerald-600" />
  if (type.includes("shipped")) return <Truck className="h-4 w-4 text-sky-600" />
  if (type.includes("delivered")) return <PackageCheck className="h-4 w-4 text-green-600" />
  if (type.includes("cancelled")) return <XCircle className="h-4 w-4 text-rose-600" />
  if (type.includes("refund")) return <Undo2 className="h-4 w-4 text-orange-600" />
  if (type.includes("created")) return <Package className="h-4 w-4 text-amber-600" />
  return <History className="h-4 w-4 text-muted-foreground" />
}

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const api = useAdminApi()
  const { me } = useMe()

  const [data, setData] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState("")

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reference, setReference] = useState("")
  const [shipOpen, setShipOpen] = useState(false)
  const [tracking, setTracking] = useState("")
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundAmount, setRefundAmount] = useState("")
  const [refundMode, setRefundMode] = useState<"STORE_CREDIT" | "MANUAL">("STORE_CREDIT")
  const [refundReason, setRefundReason] = useState("")
  const [busy, setBusy] = useState(false)

  const canConfirm = me ? me.permissions.includes("payments.confirm") : true
  const canRefund = me ? me.permissions.includes("refunds.approve") : true
  const canManage = me ? me.permissions.includes("orders.manage") : true

  const load = useCallback(async () => {
    setLoading(true)
    const result = await api.get<OrderDetail>(`/api/admin/orders/${id}`)
    if (result) {
      setData(result)
      setNote(result.order.adminNote ?? "")
    }
    setLoading(false)
     
  }, [api, id])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  async function action(fn: () => Promise<unknown>, closeFn?: () => void) {
    setBusy(true)
    const result = await fn()
    setBusy(false)
    if (result !== null) {
      closeFn?.()
      await load()
    }
  }

  const o = data?.order
  const refundableMax = o ? Math.max(0, o.amountPaid - o.amountRefunded) : 0
  const isPaid = o?.paymentStatus === "PAYMENT_PAID"
  const isPartiallyRefunded = o?.paymentStatus === "PAYMENT_PARTIALLY_REFUNDED"
  const status = o?.orderStatus ?? ""

  return (
    <div className="p-4 sm:p-6">
      <AdminPageHeader
        title={o ? `Commande ${o.orderNumber}` : "Commande"}
        description={o ? `Passée ${formatDateTime(o.createdAt)} · ${o.paymentMethodLabel ?? "moyen de paiement inconnu"}` : undefined}
        actions={
          <Button variant="outline" onClick={() => router.push("/admin/orders")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Button>
        }
      />

      {loading || !o ? (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-secondary" />
          <div className="h-64 animate-pulse rounded-xl bg-secondary" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* En-tête */}
          <Card className="rounded-xl border bg-card">
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Numéro</p>
                <p className="flex items-center gap-1.5 font-mono text-lg font-extrabold">
                  {o.orderNumber}
                  <button
                    type="button"
                    aria-label="Copier le numéro de commande"
                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(o.orderNumber).then(() => toast.success("Numéro copié."))
                    }}
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  </button>
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Client</p>
                {o.customer ? (
                  <Link href={`/admin/customers/${o.customer.id}`} className="text-sm font-semibold hover:underline">
                    {o.customerName} →
                  </Link>
                ) : (
                  <p className="text-sm font-semibold">{o.customerName} <span className="text-xs font-normal text-muted-foreground">(invité)</span></p>
                )}
                <p className="text-xs text-muted-foreground">{o.customerEmail} · {o.customerPhone}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Livraison</p>
                <p className="text-sm">{o.city}</p>
                <p className="text-xs text-muted-foreground">{o.shippingZoneName ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Statuts</p>
                <div className="flex flex-wrap gap-1.5">
                  <OrderStatusBadge status={o.orderStatus} />
                  <PaymentStatusBadge status={o.paymentStatus} />
                </div>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="text-2xl font-extrabold">{formatXOF(o.total)}</p>
                {o.trackingNumber && <p className="text-xs text-muted-foreground">Suivi : {o.trackingNumber}</p>}
              </div>
            </CardContent>
          </Card>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            {/* Colonne principale */}
            <div className="space-y-4 lg:col-span-2">
              {/* Articles */}
              <Card className="rounded-xl border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Articles ({o.items.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Produit</th>
                          <th className="px-2 py-2 font-medium">SKU</th>
                          <th className="px-2 py-2 text-right font-medium">P.U.</th>
                          <th className="px-2 py-2 text-center font-medium">Qté</th>
                          <th className="px-4 py-2 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.items.map((item) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-secondary">
                                  {item.image ? (
                                     
                                    <img src={item.image} alt={item.productName} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                      <Package className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <Link href={`/admin/products/${item.productId}`} className="block max-w-48 truncate text-sm font-medium hover:underline">
                                    {item.productName}
                                  </Link>
                                  <div className="flex flex-wrap gap-1">
                                    {item.variantName && <span className="text-xs text-muted-foreground">{item.variantName}</span>}
                                    {item.isFreeItem && <Badge variant="outline" className="h-4 border bg-emerald-50 px-1 text-[10px] text-emerald-700">Offert</Badge>}
                                    {(item.type === "DIGITAL" || item.type === "HYBRID") && (
                                      <>
                                        <Badge variant="outline" className="h-4 border bg-violet-50 px-1 text-[10px] text-violet-700">Numérique</Badge>
                                        {item.grants.length > 0 ? (
                                          item.grants[0].revoked ? (
                                            <Badge variant="outline" className="h-4 border bg-rose-50 px-1 text-[10px] text-rose-700">Accès révoqué</Badge>
                                          ) : (
                                            <Badge variant="outline" className="h-4 border bg-emerald-50 px-1 text-[10px] text-emerald-700">
                                              Accès ouvert · {item.grants[0].downloadCount}/{item.grants[0].limitCount}
                                            </Badge>
                                          )
                                        ) : (
                                          <Badge variant="outline" className="h-4 border bg-amber-50 px-1 text-[10px] text-amber-700">Accès non créé</Badge>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-xs text-muted-foreground">{item.sku ?? "—"}</td>
                            <td className="whitespace-nowrap px-2 py-2.5 text-right">{item.isFreeItem ? formatXOF(item.unitPrice) : formatXOF(item.unitPrice)}</td>
                            <td className="px-2 py-2.5 text-center tabular-nums">{item.quantity}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">
                              {item.lineTotal === 0 ? <span className="text-emerald-700">Offert</span> : formatXOF(item.lineTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Totaux */}
              <Card className="rounded-xl border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Totaux détaillés</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <p className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Sous-total</span>
                    <span>{formatXOF(o.subtotal)}</span>
                  </p>
                  {o.couponDiscount > 0 && (
                    <p className="flex justify-between gap-2 text-emerald-700">
                      <span>Coupon « {o.couponCode} »</span>
                      <span>−{formatXOF(o.couponDiscount)}</span>
                    </p>
                  )}
                  {o.promotions.map((promo) => (
                    <p key={promo.promotionId} className="flex justify-between gap-2 text-emerald-700">
                      <span>Promotion « {promo.name} »</span>
                      <span>−{formatXOF(promo.amount)}</span>
                    </p>
                  ))}
                  {o.promotionDiscount > 0 && o.promotions.length === 0 && (
                    <p className="flex justify-between gap-2 text-emerald-700">
                      <span>Réductions promotions</span>
                      <span>−{formatXOF(o.promotionDiscount)}</span>
                    </p>
                  )}
                  {o.creditUsed > 0 && (
                    <p className="flex justify-between gap-2 text-amber-700">
                      <span>Crédit boutique utilisé</span>
                      <span>−{formatXOF(o.creditUsed)}</span>
                    </p>
                  )}
                  <p className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Livraison ({o.shippingZoneName ?? "zone"})</span>
                    <span>{o.shippingCost === 0 ? "Offerte" : formatXOF(o.shippingCost)}</span>
                  </p>
                  <Separator className="my-2" />
                  <p className="flex justify-between gap-2 text-base font-extrabold">
                    <span>Total</span>
                    <span>{formatXOF(o.total)}</span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Payé</span>
                    <span className="font-semibold">{formatXOF(o.amountPaid)}</span>
                  </p>
                  {o.amountRefunded > 0 && (
                    <p className="flex justify-between gap-2 text-orange-700">
                      <span>Remboursé</span>
                      <span>−{formatXOF(o.amountRefunded)}</span>
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Timeline */}
              <Card className="rounded-xl border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Historique de la commande</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="max-h-96 space-y-3 overflow-y-auto scrollbar-thin pr-2">
                    {[...o.events].reverse().map((e) => (
                      <li key={e.id} className="flex gap-2.5">
                        <span className="mt-0.5">{eventIcon(e.type)}</span>
                        <div>
                          <p className="text-sm">{e.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(e.createdAt)}
                            {e.actorName ? ` · ${e.actorName}` : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </div>

            {/* Colonne actions */}
            <div className="space-y-4">
              <Card className="rounded-xl border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {!isPaid && !["CANCELLED", "REFUNDED"].includes(status) && (
                    <Button
                      className="w-full gap-1.5"
                      disabled={!canConfirm || busy}
                      onClick={() => setConfirmOpen(true)}
                    >
                      <BadgeCheck className="h-4 w-4" /> Confirmer le paiement
                    </Button>
                  )}

                  {/* Transitions contextuelles */}
                  <div className="flex flex-wrap gap-2">
                    {status === "PENDING" && (
                      <Button variant="outline" size="sm" disabled={!canManage || busy} onClick={() => action(() => api.post(`/api/admin/orders/${o.id}/status`, { status: "CONFIRMED" }))}>
                        Confirmer la commande
                      </Button>
                    )}
                    {status === "CONFIRMED" && (
                      <Button variant="outline" size="sm" disabled={!canManage || busy} onClick={() => action(() => api.post(`/api/admin/orders/${o.id}/status`, { status: "PROCESSING" }))}>
                        Passer en préparation
                      </Button>
                    )}
                    {(status === "CONFIRMED" || status === "PROCESSING") && (
                      <Button variant="outline" size="sm" disabled={!canManage || busy} onClick={() => { setTracking(o.trackingNumber ?? ""); setShipOpen(true) }}>
                        <Truck className="h-4 w-4" /> Expédier…
                      </Button>
                    )}
                    {status === "SHIPPED" && (
                      <Button variant="outline" size="sm" disabled={!canManage || busy} onClick={() => action(() => api.post(`/api/admin/orders/${o.id}/status`, { status: "DELIVERED" }))}>
                        <PackageCheck className="h-4 w-4" /> Marquer livrée
                      </Button>
                    )}
                  </div>

                  {["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED"].includes(status) && (
                    <Button variant="outline" size="sm" className="w-full gap-1.5 text-rose-600 hover:text-rose-700" disabled={!canManage || busy} onClick={() => { setCancelReason(""); setCancelOpen(true) }}>
                      <XCircle className="h-4 w-4" /> Annuler la commande…
                    </Button>
                  )}

                  {(isPaid || isPartiallyRefunded) && refundableMax > 0 && (
                    <Button variant="outline" size="sm" className="w-full gap-1.5" disabled={!canRefund || busy} onClick={() => { setRefundAmount(String(refundableMax)); setRefundReason(""); setRefundOpen(true) }}>
                      <Undo2 className="h-4 w-4" /> Rembourser…
                    </Button>
                  )}
                  {refundableMax > 0 && (isPaid || isPartiallyRefunded) && (
                    <p className="text-xs text-muted-foreground">Remboursable maximum : {formatXOF(refundableMax)}</p>
                  )}

                  {!me && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </CardContent>
              </Card>

              {/* Paiement */}
              <Card className="rounded-xl border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-base">
                    <CreditCard className="h-4 w-4" /> Paiement
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {o.payments.length === 0 && <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>}
                  {o.payments.map((p) => (
                    <div key={p.id} className="rounded-lg border bg-secondary/40 p-2.5 text-sm">
                      <p className="flex items-center justify-between gap-2 font-medium">
                        {p.methodLabel}
                        <span className="font-mono text-xs text-muted-foreground">{p.provider}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-2">
                        <PaymentStatusBadge status={p.status} />
                        <span className="font-semibold">{formatXOF(p.amount)}</span>
                      </p>
                      {p.reference && <p className="mt-1 text-xs text-muted-foreground">Référence : {p.reference}</p>}
                      {p.confirmedBy && (
                        <p className="text-xs text-muted-foreground">
                          Confirmé par {p.confirmedBy}
                          {p.confirmedAt ? ` le ${formatDateTime(p.confirmedAt)}` : ""}
                        </p>
                      )}
                      {p.failureReason && <p className="mt-1 text-xs text-rose-600">{p.failureReason}</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Remboursements */}
              {o.refunds.length > 0 && (
                <Card className="rounded-xl border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Remboursements</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {o.refunds.map((r) => (
                      <div key={r.id} className="rounded-lg border bg-secondary/40 p-2.5 text-sm">
                        <p className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{formatXOF(r.amount)}</span>
                          <RefundStatusBadge status={r.status} />
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {REFUND_MODE_LABELS[r.mode] ?? r.mode} · {formatDateTime(r.createdAt)}
                        </p>
                        <p className="mt-1 text-xs">{r.reason}</p>
                        {r.status === "PENDING" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 gap-1 text-xs"
                            disabled={!canRefund || busy}
                            onClick={() => action(() => api.post(`/api/admin/orders/${o.id}/refund/${r.id}/processed`, {}))}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Marquer comme effectué
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Récompenses liées */}
              {data!.rewards.length > 0 && (
                <Card className="rounded-xl border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-1.5 text-base">
                      <Gift className="h-4 w-4" /> Récompenses liées
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {data!.rewards.map((r) => (
                      <div key={r.id} className="rounded-lg border bg-secondary/40 p-2.5 text-sm">
                        <p className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{formatXOF(r.amount)}</span>
                          <RewardStatusBadge status={r.status} />
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {r.program === "COMMISSION" ? "Commission parrainage" : "Remboursement intégral"} ·{" "}
                          {r.beneficiary?.name}
                        </p>
                        <p className="mt-1 text-xs">{r.reason}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Upsells */}
              {(data!.upsell.parent || data!.upsell.children.length > 0) && (
                <Card className="rounded-xl border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Commandes complémentaires (upsell)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    {data!.upsell.parent && (
                      <p>
                        Commande parent :{" "}
                        <Link href={`/admin/orders/${data!.upsell.parent.id}`} className="font-mono font-semibold hover:underline">
                          {data!.upsell.parent.orderNumber}
                        </Link>{" "}
                        ({formatXOF(data!.upsell.parent.total)})
                      </p>
                    )}
                    {data!.upsell.children.map((child) => (
                      <p key={child.id} className="flex items-center gap-1.5">
                        <Link href={`/admin/orders/${child.id}`} className="font-mono font-semibold hover:underline">
                          {child.orderNumber}
                        </Link>
                        {formatXOF(child.total)} <OrderStatusBadge status={child.orderStatus} />
                      </p>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Note admin */}
              {canManage && (
                <Card className="rounded-xl border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Note interne</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Note visible uniquement par l'équipe…"
                      rows={3}
                    />
                    <Button
                      size="sm"
                      disabled={busy || note === (o.adminNote ?? "")}
                      onClick={() => action(() => api.patch(`/api/admin/orders/${o.id}`, { adminNote: note }))}
                    >
                      {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      Enregistrer la note
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dialog confirmation paiement */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmer le paiement</DialogTitle>
            <DialogDescription>
              La confirmation débloque les fichiers numériques du client et déclenche le traitement des récompenses parrainage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">Référence du paiement (facultatif)</Label>
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex : reçu Wave n° 7842…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Annuler</Button>
            <Button
              disabled={busy}
              onClick={() => action(() => api.post(`/api/admin/orders/${id}/confirm-payment`, { reference: reference || undefined }), () => setConfirmOpen(false))}
            >
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog expédition */}
      <Dialog open={shipOpen} onOpenChange={setShipOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Expédier la commande</DialogTitle>
            <DialogDescription>Le numéro de suivi sera visible par le client sur sa page de commande.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tracking">Numéro de suivi *</Label>
              <Input id="tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Ex : CI-ABJ-12345" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipOpen(false)}>Annuler</Button>
            <Button
              disabled={busy || tracking.trim().length === 0}
              onClick={() => action(() => api.post(`/api/admin/orders/${id}/status`, { status: "SHIPPED", trackingNumber: tracking.trim() }), () => setShipOpen(false))}
            >
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Expédier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog annulation */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Annuler la commande</DialogTitle>
            <DialogDescription>
              Le stock physique sera restitué, les accès numériques révoqués et les récompenses liées annulées.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">Motif *</Label>
              <Input id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Ex : client injoignable, rupture de stock…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Annuler</Button>
            <Button
              variant="destructive"
              disabled={busy || cancelReason.trim().length < 3}
              onClick={() => action(() => api.post(`/api/admin/orders/${id}/cancel`, { reason: cancelReason.trim() }), () => setCancelOpen(false))}
            >
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirmer l'annulation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog remboursement */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rembourser la commande</DialogTitle>
            <DialogDescription>
              Maximum remboursable : {formatXOF(refundableMax)}. Un remboursement intégral révoque les accès numériques et suspend les récompenses.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">Montant (FCFA) *</Label>
              <Input id="refund-amount" type="number" min={1} max={refundableMax} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={refundMode} onValueChange={(v) => setRefundMode(v as "STORE_CREDIT" | "MANUAL")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STORE_CREDIT">Crédit boutique (immédiat, journalisé)</SelectItem>
                  <SelectItem value="MANUAL">Remboursement manuel (virement/mobile money à effectuer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">Motif *</Label>
              <Input id="refund-reason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Ex : produit endommagé…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>Annuler</Button>
            <Button
              disabled={busy || refundReason.trim().length < 3 || Number(refundAmount) < 1 || Number(refundAmount) > refundableMax}
              onClick={() =>
                action(
                  () =>
                    api.post(`/api/admin/orders/${id}/refund`, {
                      amount: Math.round(Number(refundAmount)),
                      mode: refundMode,
                      reason: refundReason.trim(),
                    }),
                  () => setRefundOpen(false),
                )
              }
            >
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Rembourser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
