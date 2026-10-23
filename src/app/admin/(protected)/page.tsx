"use client"

import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  Clock,
  Gift,
  Package,
  Percent,
  RefreshCw,
  ShoppingCart,
  Star,
  TrendingUp,
  Users,
  HeartHandshake,
  PackageOpen,
} from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import { useAdminApi } from "@/components/admin/api-client"
import { OrderStatusBadge, PaymentStatusBadge, ProductTypeBadge } from "@/components/admin/shared/badges"
import { formatRelative } from "@/components/admin/shared/format"
import { parseJson } from "@/lib/json"
import { formatXOF } from "@/lib/money"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

// recharts (~100 Ko gzippé) chargé à la demande : le tableau de bord
// s'affiche immédiatement (KPI, listes), le graphique arrive derrière
// avec un squelette de même hauteur — aucun décalage visuel.
const RevenueChart = dynamic(() => import("@/components/admin/dashboard-chart").then((m) => m.RevenueChart), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
})

interface DashboardStats {
  days: number
  lowStockThreshold: number
  kpis: {
    revenue: number
    revenueTrend: number | null
    ordersCount: number
    ordersTrend: number | null
    avgBasket: number
    avgBasketTrend: number | null
    pendingOrders: number
    pendingPayments: number
    outOfStock: number
    lowStock: number
    newCustomers: number
    newCustomersTrend: number | null
    recurrentCustomers: number
    recurrentCustomersTrend: number | null
    couponRedemptions: number
    couponRedemptionsTrend: number | null
    pendingRewards: number
    upsellAcceptances: number
    upsellAcceptancesTrend: number | null
    abandonedCarts: number
  }
  revenueByDay: { day: string; amount: number }[]
  topProducts: {
    id: string
    name: string
    slug: string
    salesCount: number
    price: number
    type: string
    imagesJson: string
  }[]
  lastOrders: {
    id: string
    orderNumber: string
    customerName: string
    total: number
    orderStatus: string
    paymentStatus: string
    createdAt: string
  }[]
  toTreat: { pendingOrders: number; pendingReviews: number }
}

const PERIODS = [
  { value: "7", label: "7 jours" },
  { value: "30", label: "30 jours" },
  { value: "90", label: "90 jours" },
  { value: "365", label: "1 an" },
]

function trend(t: number | null) {
  return t === null ? undefined : { value: t, label: "vs période précédente" }
}

function ProductThumb({ imagesJson, name }: { imagesJson: string; name: string }) {
  const images = parseJson<string[]>(imagesJson, [])
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-secondary">
      {images[0] ? (
         
        <img src={images[0]} alt={name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Package className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

export default function AdminDashboardPage() {
  const api = useAdminApi()
  const [days, setDays] = useState("7")
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(
    async (d: string) => {
      setRefreshing(true)
      const data = await api.get<DashboardStats>(`/api/admin/dashboard/stats?days=${d}`)
      if (data) setStats(data)
      setRefreshing(false)
    },
    [api],
  )

  useEffect(() => {
    const t = setTimeout(() => void load(days), 0)
    return () => clearTimeout(t)
  }, [days, load])

  const k = stats?.kpis
  const loading = !stats

  return (
    <div className="p-4 sm:p-6">
      <AdminPageHeader
        title="Tableau de bord"
        description="Vue d'ensemble de votre boutique — chiffres réels, mise à jour à chaque chargement."
        actions={
          <div className="flex items-center gap-2">
            <Tabs id="dash-period" value={days} onValueChange={setDays}>
              <TabsList>
                {PERIODS.map((p) => (
                  <TabsTrigger key={p.value} value={p.value} className="text-xs sm:text-sm">
                    {p.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button variant="outline" size="icon" onClick={() => load(days)} aria-label="Rafraîchir" disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <section aria-label="Indicateurs clés" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        <StatCard label="CA payé" value={k?.revenue ?? 0} icon={CircleDollarSign} isCurrency loading={loading} trend={trend(k?.revenueTrend ?? null)} />
        <StatCard label="Commandes" value={k?.ordersCount ?? 0} icon={ShoppingCart} loading={loading} trend={trend(k?.ordersTrend ?? null)} hint="toutes créées" />
        <StatCard label="Panier moyen" value={k?.avgBasket ?? 0} icon={TrendingUp} isCurrency loading={loading} trend={trend(k?.avgBasketTrend ?? null)} hint="commandes payées" />
        <StatCard label="Nouveaux clients" value={k?.newCustomers ?? 0} icon={Users} loading={loading} trend={trend(k?.newCustomersTrend ?? null)} />
        <StatCard label="Clients récurrents" value={k?.recurrentCustomers ?? 0} icon={HeartHandshake} loading={loading} trend={trend(k?.recurrentCustomersTrend ?? null)} hint="≥ 2 commandes payées" />
        <StatCard label="Coupons utilisés" value={k?.couponRedemptions ?? 0} icon={Percent} loading={loading} trend={trend(k?.couponRedemptionsTrend ?? null)} />
        <StatCard label="En attente de traitement" value={k?.pendingOrders ?? 0} icon={Clock} loading={loading} hint="commandes PENDING" className={k && k.pendingOrders > 0 ? "border-amber-300" : ""} />
        <StatCard label="Paiements en attente" value={k?.pendingPayments ?? 0} icon={BadgeCheck} loading={loading} hint="à confirmer" className={k && k.pendingPayments > 0 ? "border-amber-300" : ""} />
        <StatCard label="Ruptures de stock" value={k?.outOfStock ?? 0} icon={PackageOpen} loading={loading} hint={k ? `${k.lowStock} produit(s) sous le seuil` : undefined} className={k && k.outOfStock > 0 ? "border-rose-300" : ""} />
        <StatCard label="Récompenses en attente" value={k?.pendingRewards ?? 0} icon={Gift} loading={loading} hint="parrainage — délai en cours" />
        <StatCard label="Upsells acceptés" value={k?.upsellAcceptances ?? 0} icon={TrendingUp} loading={loading} trend={trend(k?.upsellAcceptancesTrend ?? null)} />
        <StatCard label="Paniers abandonnés" value={k?.abandonedCarts ?? 0} icon={ShoppingCart} loading={loading} hint="inactifs depuis +1 h" />
      </section>

      {/* À traiter */}
      {stats && (stats.toTreat.pendingOrders > 0 || stats.toTreat.pendingReviews > 0) && (
        <Alert className="mt-4 border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold">À traiter :</span>
            {stats.toTreat.pendingOrders > 0 && (
              <Link href="/admin/orders?status=PENDING" className="inline-flex items-center gap-1 underline underline-offset-2">
                {stats.toTreat.pendingOrders} commande(s) en attente <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            {stats.toTreat.pendingReviews > 0 && (
              <Link href="/admin/marketing/reviews" className="inline-flex items-center gap-1 underline underline-offset-2">
                {stats.toTreat.pendingReviews} avis en modération <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Graphique CA */}
      <Card className="mt-4 rounded-xl border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Chiffre d'affaires payé par jour</CardTitle>
          <p className="text-xs text-muted-foreground">Commandes au statut de paiement « Payée », par date de confirmation du paiement.</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="h-64 w-full">
              <RevenueChart data={stats?.revenueByDay ?? []} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Listes */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="rounded-xl border bg-card">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Produits les plus vendus</CardTitle>
            <Link href="/admin/products" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              Tous les produits <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (stats?.topProducts.length ?? 0) === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">Aucun produit vendu pour le moment.</p>
            ) : (
              <ul className="divide-y">
                {stats?.topProducts.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <ProductThumb imagesJson={p.imagesJson} name={p.name} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/products/${p.id}`} className="block truncate text-sm font-medium hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatXOF(p.price)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <ProductTypeBadge type={p.type} />
                      <span className="text-xs text-muted-foreground">{p.salesCount} vente(s)</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border bg-card">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Dernières commandes</CardTitle>
            <Link href="/admin/orders" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              Toutes <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (stats?.lastOrders.length ?? 0) === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">Aucune commande pour le moment.</p>
            ) : (
              <ul className="divide-y">
                {stats?.lastOrders.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/orders/${o.id}`} className="block truncate text-sm font-medium hover:underline">
                        {o.orderNumber}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.customerName} · {formatRelative(o.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold">{formatXOF(o.total)}</span>
                      <div className="flex flex-wrap justify-end gap-1">
                        <OrderStatusBadge status={o.orderStatus} />
                        <PaymentStatusBadge status={o.paymentStatus} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {stats && stats.toTreat.pendingReviews > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5" /> Les avis en modération sont gérés depuis la page « Avis clients » du menu Marketing.
        </p>
      )}
    </div>
  )
}
