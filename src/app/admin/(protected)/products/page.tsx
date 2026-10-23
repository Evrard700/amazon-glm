"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  Eye,
  EyeOff,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { BulkDeleteBar } from "@/components/admin/bulk-actions"
import { useAdminApi } from "@/components/admin/api-client"
import { useMe } from "@/components/admin/shared/use-me"
import { ProductStatusBadge, ProductTypeBadge, StockBadge } from "@/components/admin/shared/badges"
import { parseJson } from "@/lib/json"
import { formatXOF } from "@/lib/money"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"

interface AdminProduct {
  id: string
  name: string
  slug: string
  type: string
  status: string
  price: number
  salePrice: number | null
  sku: string | null
  stock: number
  trackInventory: boolean
  imagesJson: string
  ratingAvg: number
  ratingCount: number
  salesCount: number
  deletedAt: string | null
  createdAt: string
  categories: string[]
  collections: string[]
  variants: { id: string; name: string; stock: number; isActive: boolean }[]
  variantsStock: number
  orderItemsCount: number
}

const STATUS_TABS = [
  { value: "ALL", label: "Tous" },
  { value: "ACTIVE", label: "Publiés" },
  { value: "DRAFT", label: "Brouillons" },
  { value: "ARCHIVED", label: "Archivés" },
  { value: "TRASH", label: "Corbeille" },
]

export default function AdminProductsPage() {
  const router = useRouter()
  const api = useAdminApi()
  const { me } = useMe()
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState("ALL")
  const [typeFilter, setTypeFilter] = useState("ALL")
  const [hardDeleteTarget, setHardDeleteTarget] = useState<AdminProduct | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)

  const canManage = me ? me.permissions.includes("products.manage") : true
  const canDelete = me ? me.permissions.includes("products.delete") : false
  const inTrash = tab === "TRASH"

  const load = useCallback(async () => {
    setLoading(true)
    const [active, deleted] = await Promise.all([
      api.get<AdminProduct[]>("/api/admin/products"),
      api.get<AdminProduct[]>("/api/admin/products?deleted=1"),
    ])
    if (active && deleted) setProducts([...active, ...deleted])
    setLoading(false)
     
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (tab === "TRASH" && !p.deletedAt) return false
      if (tab !== "TRASH" && p.deletedAt) return false
      if (tab !== "ALL" && tab !== "TRASH" && p.status !== tab) return false
      if (typeFilter !== "ALL" && p.type !== typeFilter) return false
      return true
    })
  }, [products, tab, typeFilter])

  // Sélection EFFECTIVE : uniquement les ids visibles dans l'onglet courant
  // (dérivé — pas d'effet de synchronisation ni de sélection fantôme).
  const filteredIds = useMemo(() => new Set(filtered.map((p) => p.id)), [filtered])
  const effectiveSelected = useMemo(
    () => selected.filter((id) => filteredIds.has(id)),
    [selected, filteredIds],
  )

  async function doBulkProductDelete() {
    setBulkBusy(true)
    const result = await api.delBody<{ trashed?: number; deleted?: number; blocked?: { name: string }[]; message: string }>(
      "/api/admin/products",
      { ids: effectiveSelected, mode: inTrash ? "hard" : "soft" },
    )
    setBulkBusy(false)
    if (result) {
      toast.success(result.message)
      setSelected([])
      await load()
    }
  }

  // ---------- Actions ----------
  async function mutate(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown, successMsg?: string) {
    const fn = method === "POST" ? api.post : method === "PATCH" ? api.patch : api.del
    const result = method === "DELETE" ? await api.del<{ id?: string }>(url) : await fn<{ id?: string }>(url, body as never)
    if (result !== null) {
      toast.success(successMsg ?? "Action effectuée.")
      await load()
    }
  }

  // ---------- Colonnes ----------
  const columns: ColumnDef<AdminProduct, unknown>[] = [
    {
      accessorKey: "name",
      header: "Produit",
      cell: ({ row }) => {
        const p = row.original
        const images = parseJson<string[]>(p.imagesJson, [])
        return (
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-secondary">
              {images[0] ? (
                 
                <img src={images[0]} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              {p.deletedAt ? (
                <p className="max-w-56 truncate text-sm font-medium text-muted-foreground line-through">{p.name}</p>
              ) : (
                <Link href={`/admin/products/${p.id}`} className="block max-w-56 truncate text-sm font-medium hover:underline">
                  {p.name}
                </Link>
              )}
              <p className="max-w-56 truncate text-xs text-muted-foreground">
                {p.sku ?? "sans SKU"}
                {p.categories.length > 0 && ` · ${p.categories.slice(0, 2).join(", ")}`}
              </p>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <ProductTypeBadge type={row.original.type} />,
    },
    {
      accessorKey: "status",
      header: "Statut",
      cell: ({ row }) => <ProductStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "price",
      header: "Prix",
      cell: ({ row }) => {
        const p = row.original
        if (p.salePrice !== null && p.salePrice < p.price) {
          return (
            <div className="whitespace-nowrap">
              <span className="font-semibold">{formatXOF(p.salePrice)}</span>{" "}
              <s className="text-xs text-muted-foreground">{formatXOF(p.price)}</s>
            </div>
          )
        }
        return <span>{formatXOF(p.price)}</span>
      },
    },
    {
      accessorKey: "stock",
      header: "Stock",
      cell: ({ row }) => {
        const p = row.original
        if (p.type === "DIGITAL") return <Badge variant="outline" className="border bg-violet-50 text-violet-700">illimité</Badge>
        const threshold = 5
        if (p.variants.length > 0) {
          return (
            <div className="flex flex-col gap-0.5">
              <StockBadge stock={p.stock} threshold={threshold} trackInventory={p.trackInventory} />
              <span className="text-[11px] text-muted-foreground">{p.variants.length} variante(s) : {p.variantsStock}</span>
            </div>
          )
        }
        return <StockBadge stock={p.stock} threshold={threshold} trackInventory={p.trackInventory} />
      },
    },
    {
      accessorKey: "salesCount",
      header: "Ventes",
      cell: ({ row }) => <span className="tabular-nums">{row.original.salesCount}</span>,
    },
    {
      accessorKey: "ratingAvg",
      header: "Note",
      cell: ({ row }) => {
        const p = row.original
        if (p.ratingCount === 0) return <span className="text-muted-foreground">—</span>
        return (
          <span className="whitespace-nowrap">
            ★ {p.ratingAvg.toFixed(1)} <span className="text-xs text-muted-foreground">({p.ratingCount})</span>
          </span>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const p = row.original
        if (!canManage) {
          return (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/admin/products/${p.id}`}>
                <Pencil className="h-4 w-4" /> Voir
              </Link>
            </Button>
          )
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Actions produit">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href={`/admin/products/${p.id}`}>
                  <Pencil className="h-4 w-4" /> Modifier
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => mutate(`/api/admin/products/${p.id}/duplicate`, "POST", undefined, "Produit dupliqué en brouillon.")}>
                <Copy className="h-4 w-4" /> Dupliquer
              </DropdownMenuItem>
              {p.deletedAt ? (
                <>
                  <DropdownMenuItem onClick={() => mutate(`/api/admin/products/${p.id}/restore`, "POST", undefined, "Produit restauré.")}>
                    <RotateCcw className="h-4 w-4" /> Restaurer
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-rose-600" onClick={() => setHardDeleteTarget(p)}>
                    <Trash2 className="h-4 w-4" /> Supprimer définitivement
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  {p.status === "ACTIVE" ? (
                    <DropdownMenuItem onClick={() => mutate(`/api/admin/products/${p.id}`, "PATCH", { status: "DRAFT" }, "Produit dépublié.")}>
                      <EyeOff className="h-4 w-4" /> Dépublier
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => mutate(`/api/admin/products/${p.id}`, "PATCH", { status: "ACTIVE" }, "Produit publié.")}>
                      <Eye className="h-4 w-4" /> Publier
                    </DropdownMenuItem>
                  )}
                  {p.status !== "ARCHIVED" && (
                    <DropdownMenuItem onClick={() => mutate(`/api/admin/products/${p.id}`, "PATCH", { status: "ARCHIVED" }, "Produit archivé.")}>
                      <Archive className="h-4 w-4" /> Archiver
                    </DropdownMenuItem>
                  )}
                  {p.status === "ARCHIVED" && (
                    <DropdownMenuItem onClick={() => mutate(`/api/admin/products/${p.id}`, "PATCH", { status: "DRAFT" }, "Produit désarchivé.")}>
                      <ArchiveRestore className="h-4 w-4" /> Désarchiver
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-rose-600" onClick={() => mutate(`/api/admin/products/${p.id}`, "DELETE", undefined, "Produit placé dans la corbeille.")}>
                    <Trash2 className="h-4 w-4" /> Mettre à la corbeille
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <div className="p-4 sm:p-6">
      <AdminPageHeader
        title="Produits"
        description="Gérez votre catalogue : produits physiques, numériques et hybrides, variantes, images et stock."
        actions={
          <>
            <Button variant="outline" asChild className="gap-1.5">
              <a href="/api/admin/products/export">
                <Download className="h-4 w-4" /> Exporter CSV
              </a>
            </Button>
            {canManage && (
              <Button asChild className="gap-1.5">
                <Link href="/admin/products/new">
                  <Plus className="h-4 w-4" /> Nouveau produit
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Tabs id="products-status" value={tab} onValueChange={setTab}>
          <TabsList>
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs sm:text-sm">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les types</SelectItem>
            <SelectItem value="PHYSICAL">Physiques</SelectItem>
            <SelectItem value="DIGITAL">Numériques</SelectItem>
            <SelectItem value="HYBRID">Hybrides</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {canDelete && (
        <div className="mb-3">
          <BulkDeleteBar
            count={effectiveSelected.length}
            entityLabel="produit(s)"
            confirmTitle={
              inTrash
                ? `Supprimer définitivement ${effectiveSelected.length} produit(s) ?`
                : `Mettre ${effectiveSelected.length} produit(s) à la corbeille ?`
            }
            confirmDescription={
              inTrash
                ? "Les produits sélectionnés (variantes, avis, liens) seront supprimés DÉFINITIVEMENT. Les produits présents dans des commandes ou paniers sont protégés et ignorés. Action irréversible."
                : "Les produits sélectionnés seront déplacés dans la corbeille et dépubliés du catalogue — restaurables à tout moment depuis l'onglet Corbeille."
            }
            confirmLabel={inTrash ? "Supprimer définitivement" : "Mettre à la corbeille"}
            buttonLabel={inTrash ? "Supprimer définitivement" : "Mettre à la corbeille"}
            busy={bulkBusy}
            onClear={() => setSelected([])}
            onConfirm={doBulkProductDelete}
          />
        </div>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        searchPlaceholder="Rechercher un produit (nom, SKU)…"
        emptyMessage={tab === "TRASH" ? "La corbeille est vide." : "Aucun produit ne correspond à ces filtres."}
        pageSize={10}
        selection={
          canDelete
            ? {
                getRowId: (p) => (p as AdminProduct).id,
                selectedIds: effectiveSelected,
                onSelectedIdsChange: setSelected,
              }
            : undefined
        }
      />

      <AlertDialog open={hardDeleteTarget !== null} onOpenChange={(o) => !o && setHardDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement « {hardDeleteTarget?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Elle sera refusée par le serveur si des lignes de commande référencent ce produit
              (historique préservé). Le produit, ses variantes, ses avis et ses liens panier seront effacés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={async () => {
                if (hardDeleteTarget) {
                  await mutate(`/api/admin/products/${hardDeleteTarget.id}/hard-delete`, "POST", undefined, "Produit supprimé définitivement.")
                  setHardDeleteTarget(null)
                }
              }}
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
