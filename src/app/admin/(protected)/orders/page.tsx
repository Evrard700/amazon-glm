"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { Download, ExternalLink, Eye } from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { BulkDeleteBar } from "@/components/admin/bulk-actions"
import { useAdminApi } from "@/components/admin/api-client"
import { useMe } from "@/components/admin/shared/use-me"
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/shared/badges"
import { formatDateTime } from "@/components/admin/shared/format"
import { formatXOF } from "@/lib/money"
import { PAYMENT_STATUS_LABELS } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

interface AdminOrder {
  id: string
  orderNumber: string
  customerName: string
  customerEmail: string
  userId: string | null
  city: string
  itemsCount: number
  total: number
  amountPaid: number
  couponCode: string | null
  orderStatus: string
  paymentStatus: string
  paymentMethodLabel: string | null
  shippingZoneName: string | null
  createdAt: string
  upsellParentOrderId: string | null
}

interface OrdersResponse {
  total: number
  statusCounts: Record<string, number>
  orders: AdminOrder[]
}

const TABS = [
  { value: "ALL", label: "Toutes" },
  { value: "PENDING", label: "En attente" },
  { value: "CONFIRMED", label: "Confirmées" },
  { value: "PROCESSING", label: "En préparation" },
  { value: "SHIPPED", label: "Expédiées" },
  { value: "DELIVERED", label: "Livrées" },
  { value: "CANCELLED", label: "Annulées" },
  { value: "REFUNDED", label: "Remboursées" },
]

/** Sélectionnable = supprimable côté serveur (protection comptable). */
function isSelectable(o: AdminOrder): boolean {
  return o.paymentStatus !== "PAYMENT_PAID"
}

export default function AdminOrdersPage() {
  const api = useAdminApi()
  const { me } = useMe()
  const [data, setData] = useState<OrdersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState("ALL")
  const [paymentFilter, setPaymentFilter] = useState("ALL")
  const [selected, setSelected] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)

  const canDelete = me ? me.permissions.includes("orders.delete") : false

  const load = useCallback(async () => {
    setLoading(true)
    const result = await api.get<OrdersResponse>("/api/admin/orders")
    if (result) setData(result)
    setLoading(false)
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.orders.filter((o) => {
      if (tab !== "ALL" && o.orderStatus !== tab) return false
      if (paymentFilter !== "ALL" && o.paymentStatus !== paymentFilter) return false
      return true
    })
  }, [data, tab, paymentFilter])

  // Sélection EFFECTIVE : uniquement les ids encore visibles (dérivé, sans
  // effet de synchronisation — les filtres ne laissent jamais de sélection fantôme).
  const filteredIds = useMemo(() => new Set(filtered.map((o) => o.id)), [filtered])
  const effectiveSelected = useMemo(
    () => selected.filter((id) => filteredIds.has(id)),
    [selected, filteredIds],
  )

  async function doBulkDelete() {
    setBulkBusy(true)
    const result = await api.delBody<{ deleted: number; blocked: { orderNumber: string; reason: string }[]; message: string }>(
      "/api/admin/orders",
      { ids: effectiveSelected },
    )
    setBulkBusy(false)
    if (result) {
      toast.success(result.message)
      setSelected([])
      await load()
    }
  }

  const columns: ColumnDef<AdminOrder, unknown>[] = [
    {
      accessorKey: "orderNumber",
      header: "Numéro",
      cell: ({ row }) => {
        const o = row.original
        return (
          <div className="min-w-0">
            <Link href={`/admin/orders/${o.id}`} className="font-mono text-sm font-semibold hover:underline">
              {o.orderNumber}
            </Link>
            {o.upsellParentOrderId && (
              <span className="ml-1.5 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand-foreground">Upsell</span>
            )}
            <p className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)}</p>
          </div>
        )
      },
    },
    {
      accessorKey: "customerName",
      header: "Client",
      cell: ({ row }) => {
        const o = row.original
        return (
          <div className="min-w-0">
            <span className="block max-w-40 truncate text-sm font-medium">{o.customerName}</span>
            <span className="block max-w-40 truncate text-xs text-muted-foreground">{o.customerEmail}</span>
          </div>
        )
      },
    },
    {
      accessorKey: "city",
      header: "Zone",
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="block max-w-32 truncate text-sm">{row.original.city}</span>
          <span className="block max-w-32 truncate text-xs text-muted-foreground">{row.original.shippingZoneName ?? "—"}</span>
        </div>
      ),
    },
    {
      accessorKey: "itemsCount",
      header: "Articles",
      cell: ({ row }) => <span className="tabular-nums">{row.original.itemsCount}</span>,
    },
    {
      accessorKey: "total",
      header: "Total",
      cell: ({ row }) => {
        const o = row.original
        return (
          <div className="whitespace-nowrap">
            <span className="font-semibold">{formatXOF(o.total)}</span>
            {o.couponCode && <p className="text-xs text-muted-foreground">code {o.couponCode}</p>}
          </div>
        )
      },
    },
    {
      accessorKey: "paymentStatus",
      header: "Paiement",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <PaymentStatusBadge status={row.original.paymentStatus} />
          <span className="text-[11px] text-muted-foreground">{row.original.paymentMethodLabel ?? ""}</span>
        </div>
      ),
    },
    {
      accessorKey: "orderStatus",
      header: "Statut",
      cell: ({ row }) => <OrderStatusBadge status={row.original.orderStatus} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/admin/orders/${row.original.id}`}>
            <Eye className="h-4 w-4" /> Voir
          </Link>
        </Button>
      ),
    },
  ]

  return (
    <div className="p-4 sm:p-6">
      <AdminPageHeader
        title="Commandes"
        description="Suivez chaque commande : paiement, préparation, expédition, livraison, remboursement — et supprimez en masse les commandes non encaissées."
        actions={
          <Button variant="outline" asChild className="gap-1.5">
            <a href="/api/admin/orders/export">
              <Download className="h-4 w-4" /> Exporter CSV
            </a>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Tabs id="orders-status" value={tab} onValueChange={setTab}>
          <TabsList className="h-auto flex-wrap">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs sm:text-sm">
                {t.label}
                {data?.statusCounts?.[t.value] ? (
                  <span className="ml-1 rounded-full bg-secondary px-1.5 text-[10px] font-semibold">{data.statusCounts[t.value]}</span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Paiement" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les paiements</SelectItem>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canDelete && (
        <div className="mb-3">
          <BulkDeleteBar
            count={effectiveSelected.length}
            entityLabel="commande(s)"
            confirmTitle={`Supprimer ${effectiveSelected.length} commande(s) ?`}
            confirmDescription="Les commandes en attente, échouées, annulées ou remboursées seront supprimées définitivement (articles, événements, paiements). Les commandes payées non remboursées sont protégées et ignorées."
            busy={bulkBusy}
            onClear={() => setSelected([])}
            onConfirm={doBulkDelete}
          />
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher (numéro, email, nom)…"
        emptyMessage="Aucune commande ne correspond à ces filtres."
        pageSize={15}
        selection={
          canDelete
            ? {
                getRowId: (o) => (o as AdminOrder).id,
                selectedIds: effectiveSelected,
                onSelectedIdsChange: setSelected,
                isRowSelectable: (o) => isSelectable(o as AdminOrder),
              }
            : undefined
        }
      />

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ExternalLink className="h-3 w-3" /> Cliquez sur un numéro pour ouvrir la fiche détaillée de la commande.
        {canDelete && " Cochez des lignes pour une suppression groupée (les commandes payées non remboursées sont protégées)."}
      </p>
    </div>
  )
}
