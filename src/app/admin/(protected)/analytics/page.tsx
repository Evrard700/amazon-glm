"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import {
  BarChart3,
  TrendingUp,
  Users,
  TicketPercent,
  Gift,
  TrendingUp as UpsellIcon,
} from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import { useAdminApi } from "@/components/admin/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Image as ImageIcon } from "lucide-react"
import { formatXOF } from "@/lib/money"
import { Skeleton } from "@/components/ui/skeleton"

// recharts (~100 Ko gzippé) chargé à la demande : les trois graphiques
// partagent le même module (une seule requête), la page s'affiche
// immédiatement et chaque emplacement garde sa hauteur via un squelette.
const RevenuePerDayChart = dynamic(
  () => import("@/components/admin/analytics-charts").then((m) => m.RevenuePerDayChart),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
)
const ClientsPerDayChart = dynamic(
  () => import("@/components/admin/analytics-charts").then((m) => m.ClientsPerDayChart),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
)
const RevenueByCategoryChart = dynamic(
  () => import("@/components/admin/analytics-charts").then((m) => m.RevenueByCategoryChart),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
)

interface AnalyticsData {
  revenueByCategory: { id: string; name: string; revenue: number; units: number }[]
  topProducts: { id: string; name: string; slug: string; price: number; salePrice: number | null; stock: number; salesCount: number; revenue: number; images: string[] }[]
  perDayRevenue: { date: string; revenue: number }[]
  perDayClients: { date: string; count: number }[]
  couponUsage: { code: string; count: number }[]
  referral: { referredRevenue: number; commissionGranted: number; fullRefundGranted: number; ordersWithReferrer: number }
  upsell: { acceptances: number; eligiblePaidOrders: number; rate: number; note: string }
}

export default function AdminAnalyticsPage() {
  const api = useAdminApi()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [days, setDays] = useState("30")

  useEffect(() => {
    const t = setTimeout(async () => {
      const d = await api.get<AnalyticsData>(`/api/admin/analytics?days=${days}`)
      if (d) setData(d)
    }, 0)
    return () => clearTimeout(t)
  }, [days, api])

  return (
    <div>
      <AdminPageHeader
        title="Statistiques avancées"
        description="Chaque chiffre est calculé à partir des données réelles de la base."
        actions={
          <Tabs id="analytics-period" value={days} onValueChange={setDays}>
            <TabsList>
              <TabsTrigger value="7">7 j</TabsTrigger>
              <TabsTrigger value="30">30 j</TabsTrigger>
              <TabsTrigger value="90">3 mois</TabsTrigger>
              <TabsTrigger value="365">12 mois</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="CA parrainé (filleuls)" value={data?.referral.referredRevenue ?? 0} isCurrency icon={Gift} loading={!data} />
        <StatCard label="Commissions accordées" value={data?.referral.commissionGranted ?? 0} isCurrency icon={TicketPercent} loading={!data} />
        <StatCard label="Remboursements parrainage" value={data?.referral.fullRefundGranted ?? 0} isCurrency icon={Gift} loading={!data} />
        <StatCard label="Upsells acceptés" value={data?.upsell.acceptances ?? 0} icon={UpsellIcon} hint={`Taux : ${data?.upsell.rate ?? 0} %`} loading={!data} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-brand-foreground" /> Chiffre d'affaires par jour</CardTitle></CardHeader>
          <CardContent className="h-64">
            {data && <RevenuePerDayChart data={data.perDayRevenue} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-brand-foreground" /> Nouveaux clients par jour</CardTitle></CardHeader>
          <CardContent className="h-64">
            {data && <ClientsPerDayChart data={data.perDayClients} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-brand-foreground" /> CA par catégorie</CardTitle></CardHeader>
          <CardContent className="h-64">
            {data && <RevenueByCategoryChart data={data.revenueByCategory} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4 text-brand-foreground" /> Top produits</CardTitle></CardHeader>
          <CardContent>
            <ul className="scrollbar-thin max-h-64 space-y-2 overflow-y-auto">
              {data?.topProducts.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg border bg-card p-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.salesCount} vente(s) · stock {p.stock}</p>
                  </div>
                  <p className="text-sm font-bold">{formatXOF(p.revenue)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base">Coupons les plus utilisés</CardTitle></CardHeader>
          <CardContent>
            {data && data.couponUsage.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun coupon utilisé sur la période.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data?.couponUsage.map((c) => (
                  <span key={c.code} className="flex items-center gap-2 rounded-lg border bg-secondary/60 px-3 py-2 text-sm">
                    <code className="font-mono font-bold">{c.code}</code>
                    <span className="text-muted-foreground">× {c.count}</span>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-4 rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
              📈 Upsell — {data?.upsell.note}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
