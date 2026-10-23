"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Download, Plus, Star, UserRound, Wallet } from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { BulkDeleteBar } from "@/components/admin/bulk-actions"
import { useAdminApi } from "@/components/admin/api-client"
import { useMe } from "@/components/admin/shared/use-me"
import { formatDate } from "@/components/admin/shared/format"
import { formatXOF } from "@/lib/money"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface AdminCustomer {
  id: string
  name: string
  email: string
  phone: string | null
  city: string | null
  paidOrdersCount: number
  totalSpent: number
  storeCredit: number
  referralsCount: number
  reviewsCount: number
  tags: string[]
  marketingConsent: boolean
  isActive: boolean
  createdAt: string
}

export default function AdminCustomersPage() {
  const api = useAdminApi()
  const { me } = useMe()
  const [customers, setCustomers] = useState<AdminCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)

  const canDelete = me ? me.permissions.includes("customers.delete") : false

  const load = useCallback(async () => {
    setLoading(true)
    const data = await api.get<AdminCustomer[]>("/api/admin/customers")
    if (data) setCustomers(data)
    setLoading(false)
     
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  function onExportCsv() {
    if (customers.length === 0) {
      toast.error("Aucune donnée à exporter.")
      return
    }
    const header = ["ID", "Nom", "Email", "Téléphone", "Ville", "Commandes payées", "Total dépensé", "Crédit", "Filleuls", "Tags", "Inscrit le"]
    const lines = customers.map((c) =>
      [
        c.id,
        `"${c.name.replace(/"/g, '""')}"`,
        c.email,
        c.phone ?? "",
        c.city ?? "",
        c.paidOrdersCount,
        c.totalSpent,
        c.storeCredit,
        c.referralsCount,
        `"${c.tags.join(" ")}"`,
        new Date(c.createdAt).toISOString(),
      ].join(","),
    )
    const csv = "\uFEFF" + [header.join(","), ...lines].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `teranga-clients-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${customers.length} client(s) exporté(s).`)
  }

  async function doBulkDelete() {
    setBulkBusy(true)
    const result = await api.delBody<{ deleted: number; blocked: { email: string }[]; message: string }>(
      "/api/admin/customers",
      { ids: selected },
    )
    setBulkBusy(false)
    if (result) {
      toast.success(result.message)
      setSelected([])
      await load()
    }
  }

  const columns: ColumnDef<AdminCustomer, unknown>[] = [
    {
      accessorKey: "name",
      header: "Client",
      cell: ({ row }) => {
        const c = row.original
        return (
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-foreground">
              {c.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <Link href={`/admin/customers/${c.id}`} className="block truncate text-sm font-medium hover:underline">
                {c.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{c.email}</p>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "phone",
      header: "Téléphone",
      cell: ({ row }) => <span className="text-xs">{row.original.phone ?? "—"}</span>,
    },
    {
      accessorKey: "city",
      header: "Ville",
      cell: ({ row }) => <span className="text-sm">{row.original.city ?? "—"}</span>,
    },
    {
      accessorKey: "paidOrdersCount",
      header: "Commandes",
      cell: ({ row }) => <span className="tabular-nums">{row.original.paidOrdersCount}</span>,
    },
    {
      accessorKey: "totalSpent",
      header: "Dépensé",
      cell: ({ row }) => (
        <span className="font-semibold tabular-nums">{formatXOF(row.original.totalSpent)}</span>
      ),
    },
    {
      accessorKey: "storeCredit",
      header: "Crédit",
      cell: ({ row }) => (
        <span className={row.original.storeCredit > 0 ? "font-medium text-emerald-700 tabular-nums" : "text-muted-foreground"}>
          {row.original.storeCredit > 0 ? formatXOF(row.original.storeCredit) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "referralsCount",
      header: "Filleuls",
      cell: ({ row }) => (
        <span className="flex items-center gap-1 tabular-nums">
          {row.original.referralsCount > 0 ? <Plus className="h-3 w-3 text-emerald-600" /> : null}
          {row.original.referralsCount}
        </span>
      ),
    },
    {
      accessorKey: "tags",
      header: "Tags",
      cell: ({ row }) => (
        <div className="flex max-w-40 flex-wrap gap-1">
          {row.original.tags.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            row.original.tags.slice(0, 3).map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                {t}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Inscrit le",
      cell: ({ row }) => <span className="whitespace-nowrap text-xs">{formatDate(row.original.createdAt)}</span>,
    },
  ]

  const totalSpent = customers.reduce((s, c) => s + c.totalSpent, 0)
  const withCredit = customers.filter((c) => c.storeCredit > 0).length

  return (
    <div className="p-4 sm:p-6">
      <AdminPageHeader
        title="Clients (CRM)"
        description="Historique d'achat, crédit boutique, parrainage et notes internes de chaque client."
        actions={
          <Button variant="outline" onClick={onExportCsv} className="gap-1.5">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-lg">
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" /> Clients
          </p>
          <p className="mt-1 text-2xl font-extrabold">{customers.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> CA cumulé payé
          </p>
          <p className="mt-1 text-2xl font-extrabold">{formatXOF(totalSpent)}</p>
          <p className="text-xs text-muted-foreground">{withCredit} client(s) avec crédit</p>
        </div>
      </div>

      {canDelete && (
        <div className="mb-3">
          <BulkDeleteBar
            count={selected.length}
            entityLabel="compte(s) client"
            confirmTitle={`Supprimer ${selected.length} compte(s) client ?`}
            confirmDescription="Les comptes sélectionnés (et leur crédit boutique, récompenses, téléchargements) seront supprimés définitivement. L'historique des commandes est conservé (détaché du compte). Cette action est irréversible."
            busy={bulkBusy}
            onClear={() => setSelected([])}
            onConfirm={doBulkDelete}
          />
        </div>
      )}

      <DataTable
        columns={columns}
        data={customers}
        loading={loading}
        searchPlaceholder="Rechercher (nom, email, téléphone, ville)…"
        emptyMessage="Aucun client pour le moment."
        pageSize={15}
        selection={
          canDelete
            ? {
                getRowId: (c) => (c as AdminCustomer).id,
                selectedIds: selected,
                onSelectedIdsChange: setSelected,
              }
            : undefined
        }
        onRowClick={(c) => {
          window.location.href = `/admin/customers/${(c as AdminCustomer).id}`
        }}
      />

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Star className="h-3 w-3" /> Cliquez sur un client pour ouvrir sa fiche CRM détaillée.
        {canDelete && " Cochez des comptes pour une suppression groupée."}
      </p>
    </div>
  )
}
