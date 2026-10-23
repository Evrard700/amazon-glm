"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import {
  CheckCircle2,
  Layers,
  MoreHorizontal,
  Package,
  Pencil,
  Percent,
  Plus,
  ShoppingCart,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { AdminPageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { StatCard } from "@/components/admin/stat-card"
import { useAdminApi } from "@/components/admin/api-client"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"
import {
  ActiveBadge,
  FieldHint,
  FieldLabel,
  formatDateFR,
  MarketingEmptyState,
  TableActionButton,
  ToneBadge,
  toLocalInputValue,
} from "@/components/admin/marketing/helpers"
import {
  CategoryMultiPicker,
  ProductMultiPicker,
  ProductSingleSelect,
} from "@/components/admin/marketing/entity-picker"
import { useLightLists } from "@/components/admin/marketing/use-light-lists"

interface AdminUpsell {
  id: string
  name: string
  triggerType: "PRODUCT" | "CATEGORY" | "ORDER_AMOUNT"
  triggerProductIds: string[]
  triggerCategoryIds: string[]
  triggerMinAmount: number
  offerProductId: string
  offerProduct: {
    id: string
    name: string
    normalPrice: number
    image: string | null
    type: string
    stock: number
  } | null
  specialPrice: number
  message: string
  imageUrl: string | null
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  maxAccepts: number | null
  acceptedCount: number
  showOnThankYou: boolean
  showInCart: boolean
  position: number
  eligibleOrders: number
  createdAt: string
}

interface AcceptanceRow {
  id: string
  offerName: string
  orderNumber: string
  complementaryOrderNumber: string | null
  customer: { name: string; email: string | null }
  acceptedPrice: number
  createdAt: string
}

const TRIGGER_CARDS = [
  { value: "PRODUCT" as const, title: "Produit déclencheur", desc: "Proposée si la commande contient un des produits choisis.", icon: Package },
  { value: "CATEGORY" as const, title: "Catégorie déclencheuse", desc: "Proposée si la commande contient un article des catégories choisies.", icon: Layers },
  { value: "ORDER_AMOUNT" as const, title: "Montant de commande", desc: "Proposée dès que le sous-total dépasse un montant.", icon: Wallet },
]

const emptyForm = {
  name: "",
  triggerType: "PRODUCT" as AdminUpsell["triggerType"],
  triggerProductIds: [] as string[],
  triggerCategoryIds: [] as string[],
  triggerMinAmount: 30000,
  offerProductId: null as string | null,
  specialPrice: 0,
  message: "",
  imageUrl: "",
  startsAt: "",
  endsAt: "",
  isActive: true,
  maxAccepts: null as number | null,
  showOnThankYou: true,
  showInCart: false,
  position: 0,
}

export default function UpsellsPage() {
  const api = useAdminApi()
  const { products, categories, loaded: listsLoaded } = useLightLists({ products: true, categories: true })

  const [offers, setOffers] = useState<AdminUpsell[]>([])
  const [acceptances, setAcceptances] = useState<AcceptanceRow[]>([])
  const [stats, setStats] = useState({ activeCount: 0, totalAccepts: 0, acceptanceRate: null as number | null, additionalRevenue: 0 })
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUpsell | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const data = await api.get<{ stats: typeof stats; offers: AdminUpsell[]; acceptances: AcceptanceRow[] }>(
      "/api/admin/marketing/upsells",
    )
    if (data) {
      setOffers(data.offers)
      setAcceptances(data.acceptances)
      setStats(data.stats)
    }
    setLoading(false)
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const selectedProduct = products.find((p) => p.id === (editing ? form.offerProductId : form.offerProductId))
  const normalPrice = selectedProduct?.unitPrice ?? null
  const savings = normalPrice !== null ? Math.max(0, normalPrice - form.specialPrice) : null
  const savingsPercent = normalPrice && savings !== null && normalPrice > 0 ? Math.round((savings / normalPrice) * 100) : null

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setDialogOpen(true)
  }

  const openEdit = (o: AdminUpsell) => {
    setEditing(o)
    setForm({
      name: o.name,
      triggerType: o.triggerType,
      triggerProductIds: o.triggerProductIds,
      triggerCategoryIds: o.triggerCategoryIds,
      triggerMinAmount: o.triggerMinAmount,
      offerProductId: o.offerProductId,
      specialPrice: o.specialPrice,
      message: o.message,
      imageUrl: o.imageUrl ?? "",
      startsAt: toLocalInputValue(o.startsAt),
      endsAt: toLocalInputValue(o.endsAt),
      isActive: o.isActive,
      maxAccepts: o.maxAccepts,
      showOnThankYou: o.showOnThankYou,
      showInCart: o.showInCart,
      position: o.position,
    })
    setDialogOpen(true)
  }

  const validateForm = (): string | null => {
    if (form.name.trim().length < 3) return "Le nom doit contenir au moins 3 caractères."
    if (!form.offerProductId) return "Choisissez le produit proposé."
    if (form.message.trim().length < 10) return "Le message commercial doit contenir au moins 10 caractères."
    if (normalPrice !== null && form.specialPrice >= normalPrice) {
      return `Le prix spécial doit être inférieur au prix normal (${formatXOF(normalPrice)}).`
    }
    if (form.triggerType === "PRODUCT" && form.triggerProductIds.length === 0) return "Sélectionnez au moins un produit déclencheur."
    if (form.triggerType === "CATEGORY" && form.triggerCategoryIds.length === 0) return "Sélectionnez au moins une catégorie déclencheuse."
    if (form.triggerType === "ORDER_AMOUNT" && form.triggerMinAmount <= 0) return "Précisez le montant déclencheur."
    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) {
      return "La date de fin doit être postérieure à la date de début."
    }
    return null
  }

  const submit = async () => {
    const error = validateForm()
    if (error) {
      toast.error(error)
      return
    }
    setBusy(true)
    const payload = {
      name: form.name.trim(),
      triggerType: form.triggerType,
      triggerProductIds: form.triggerType === "PRODUCT" ? form.triggerProductIds : [],
      triggerCategoryIds: form.triggerType === "CATEGORY" ? form.triggerCategoryIds : [],
      triggerMinAmount: form.triggerType === "ORDER_AMOUNT" ? Math.max(0, Math.round(form.triggerMinAmount)) : 0,
      offerProductId: form.offerProductId,
      specialPrice: Math.max(0, Math.round(form.specialPrice)),
      message: form.message.trim(),
      imageUrl: form.imageUrl.trim() || null,
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      isActive: form.isActive,
      maxAccepts: form.maxAccepts === null ? null : Math.max(1, Math.round(form.maxAccepts)),
      showOnThankYou: form.showOnThankYou,
      showInCart: form.showInCart,
      position: Math.max(0, Math.round(form.position)),
    }
    const data = editing
      ? await api.patch(`/api/admin/marketing/upsells/${editing.id}`, payload)
      : await api.post("/api/admin/marketing/upsells", payload)
    if (data) {
      toast.success(editing ? "Offre upsell mise à jour." : "Offre upsell créée.")
      setDialogOpen(false)
      void load()
    }
    setBusy(false)
  }

  const toggleActive = async (o: AdminUpsell) => {
    const data = await api.patch(`/api/admin/marketing/upsells/${o.id}`, { isActive: !o.isActive })
    if (data) {
      toast.success(`« ${o.name} » ${!o.isActive ? "activée" : "désactivée"}.`)
      void load()
    }
  }

  const doDelete = async (o: AdminUpsell) => {
    const data = await api.del(`/api/admin/marketing/upsells/${o.id}`)
    if (data) {
      toast.success(`« ${o.name} » supprimée.`)
      void load()
    }
  }

  const offerColumns: ColumnDef<AdminUpsell, unknown>[] = [
      {
        accessorKey: "name",
        header: "Offre",
        cell: ({ row }) => (
          <div className="min-w-52">
            <p className="font-medium leading-tight">{row.original.name}</p>
            <p className="mt-0.5 max-w-72 truncate text-xs text-muted-foreground" title={row.original.message}>
              {row.original.message}
            </p>
          </div>
        ),
      },
      {
        id: "trigger",
        header: "Déclencheur",
        cell: ({ row }) => {
          const o = row.original
          if (o.triggerType === "PRODUCT") {
            const n = o.triggerProductIds.length
            return (
              <ToneBadge tone="neutral">
                <Package className="mr-1 h-3 w-3" /> {n} produit{n > 1 ? "s" : ""}
              </ToneBadge>
            )
          }
          if (o.triggerType === "CATEGORY") {
            const n = o.triggerCategoryIds.length
            return (
              <ToneBadge tone="neutral">
                <Layers className="mr-1 h-3 w-3" /> {n} catégorie{n > 1 ? "s" : ""}
              </ToneBadge>
            )
          }
          return <ToneBadge tone="brand">Dès {formatXOF(o.triggerMinAmount)}</ToneBadge>
        },
      },
      {
        id: "offer",
        header: "Produit proposé",
        cell: ({ row }) => {
          const o = row.original
          if (!o.offerProduct) return <span className="text-xs text-muted-foreground">Produit supprimé</span>
          const normal = o.offerProduct.normalPrice
          const pct = normal > 0 ? Math.round(((normal - o.specialPrice) / normal) * 100) : 0
          return (
            <div className="flex min-w-44 items-center gap-2">
              {o.offerProduct.image ? (
                 
                <img src={o.offerProduct.image} alt="" className="h-9 w-9 rounded-md object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">{o.offerProduct.name}</p>
                <p className="text-xs">
                  <span className="mr-1 text-muted-foreground line-through">{formatXOF(normal)}</span>
                  <span className="font-semibold text-emerald-700">{formatXOF(o.specialPrice)}</span>
                  <ToneBadge tone="ok" className="ml-1.5">−{pct} %</ToneBadge>
                </p>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "acceptedCount",
        header: "Acceptations",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.acceptedCount}
            {row.original.maxAccepts !== null ? ` / ${row.original.maxAccepts}` : " / ∞"}
          </span>
        ),
      },
      {
        id: "dates",
        header: "Dates",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.startsAt || row.original.endsAt
              ? `${row.original.startsAt ? formatDateFR(row.original.startsAt) : "—"} → ${row.original.endsAt ? formatDateFR(row.original.endsAt) : "∞"}`
              : "Permanente"}
          </span>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Statut",
        cell: ({ row }) => <ActiveBadge isActive={row.original.isActive} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const o = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <TableActionButton label="Modifier" tone="brand" onClick={() => openEdit(o)} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => toggleActive(o)}>
                    {o.isActive ? "Désactiver" : "Activer"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openEdit(o)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Modifier
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-rose-600 focus:text-rose-700"
                    disabled={o.acceptedCount > 0}
                    onClick={() => doDelete(o)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    {o.acceptedCount > 0 ? "Suppression bloquée (acceptée)" : "Supprimer"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ]

  const acceptanceColumns: ColumnDef<AcceptanceRow, unknown>[] = [
      {
        accessorKey: "createdAt",
        header: "Date",
        cell: ({ row }) => <span className="text-xs">{formatDateFR(row.original.createdAt)}</span>,
      },
      {
        accessorKey: "offerName",
        header: "Offre",
        cell: ({ row }) => <span className="max-w-52 truncate text-sm">{row.original.offerName}</span>,
      },
      {
        accessorKey: "orderNumber",
        header: "Commande initiale",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.orderNumber}</span>,
      },
      {
        accessorKey: "complementaryOrderNumber",
        header: "Commande complémentaire",
        cell: ({ row }) =>
          row.original.complementaryOrderNumber ? (
            <span className="font-mono text-xs text-emerald-700">{row.original.complementaryOrderNumber}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "customer",
        header: "Client",
        cell: ({ row }) => (
          <div className="min-w-40">
            <p className="text-sm leading-tight">{row.original.customer.name}</p>
            {row.original.customer.email && (
              <p className="text-xs text-muted-foreground">{row.original.customer.email}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "acceptedPrice",
        header: "Prix payé",
        cell: ({ row }) => (
          <span className="text-sm font-semibold tabular-nums">{formatXOF(row.original.acceptedPrice)}</span>
        ),
      },
    ]

  return (
    <div>
      <AdminPageHeader
        title="Upsells"
        description="Offres complémentaires proposées après commande ou dans le panier — acceptées explicitement par le client, facturées en commande liée."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Nouvelle offre
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Offres actives" value={stats.activeCount} icon={Sparkles} loading={loading} />
        <StatCard label="Acceptations" value={stats.totalAccepts} icon={CheckCircle2} loading={loading} />
        <StatCard
          label="Taux d'acceptation"
          value={stats.acceptanceRate === null ? "—" : `${stats.acceptanceRate} %`}
          hint="≈ acceptations / commandes éligibles"
          icon={Percent}
          loading={loading}
        />
        <StatCard label="CA additionnel" value={stats.additionalRevenue} isCurrency icon={TrendingUp} loading={loading} />
      </div>

      <Tabs defaultValue="offres">
        <TabsList>
          <TabsTrigger value="offres">Offres ({offers.length})</TabsTrigger>
          <TabsTrigger value="acceptations">Acceptations ({acceptances.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="offres" className="mt-4">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : offers.length === 0 ? (
            <MarketingEmptyState
              icon={ShoppingCart}
              title="Aucune offre upsell"
              description="Proposez un accessoire au bon moment : après l'achat d'un smartphone, une protection d'écran à prix réduit dans la même livraison."
              action={
                <Button onClick={openCreate} size="sm">
                  <Plus className="mr-1.5 h-4 w-4" /> Créer une offre
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={offerColumns}
              data={offers}
              searchPlaceholder="Rechercher une offre…"
              emptyMessage="Aucune offre ne correspond."
              pageSize={10}
            />
          )}
        </TabsContent>

        <TabsContent value="acceptations" className="mt-4">
          <p className="mb-3 text-xs text-muted-foreground">
            Chaque acceptation crée une COMMANDE COMPLÉMENTAIRE réelle, liée à la commande initiale — jamais de débit caché.
          </p>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : acceptances.length === 0 ? (
            <MarketingEmptyState
              icon={CheckCircle2}
              title="Aucune acceptation"
              description="Les acceptations apparaîtront ici dès qu'un client acceptera une offre sur la page de remerciement."
            />
          ) : (
            <DataTable
              columns={acceptanceColumns}
              data={acceptances}
              searchPlaceholder="Rechercher une offre, un client…"
              emptyMessage="Aucune acceptation."
              pageSize={10}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* ---------- Dialog formulaire ---------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[min(44rem,95vw)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Modifier « ${editing.name} »` : "Nouvelle offre upsell"}</DialogTitle>
            <DialogDescription>
              L'offre est proposée au client qui doit cliquer pour accepter — le prix spécial vient toujours de la base, l'acceptation génère une commande liée.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <FieldLabel required>Nom</FieldLabel>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Protégez votre écran à prix réduit"
                className="h-9"
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel required>Déclencheur</FieldLabel>
              <div className="grid gap-2 md:grid-cols-3">
                {TRIGGER_CARDS.map((t) => {
                  const Icon = t.icon
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, triggerType: t.value }))}
                      className={cn(
                        "rounded-xl border p-3 text-left transition",
                        form.triggerType === t.value
                          ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                          : "hover:bg-secondary/60",
                      )}
                    >
                      <Icon className="mb-1.5 h-4 w-4 text-amber-600" strokeWidth={1.8} />
                      <p className="text-sm font-semibold leading-tight">{t.title}</p>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{t.desc}</p>
                    </button>
                  )
                })}
              </div>
              {form.triggerType === "PRODUCT" &&
                (listsLoaded ? (
                  <ProductMultiPicker
                    products={products}
                    selected={form.triggerProductIds}
                    onChange={(ids) => setForm((f) => ({ ...f, triggerProductIds: ids }))}
                  />
                ) : (
                  <Skeleton className="h-9 w-full" />
                ))}
              {form.triggerType === "CATEGORY" &&
                (listsLoaded ? (
                  <CategoryMultiPicker
                    categories={categories}
                    selected={form.triggerCategoryIds}
                    onChange={(ids) => setForm((f) => ({ ...f, triggerCategoryIds: ids }))}
                  />
                ) : (
                  <Skeleton className="h-9 w-full" />
                ))}
              {form.triggerType === "ORDER_AMOUNT" && (
                <div className="space-y-1.5">
                  <FieldLabel required>Montant déclencheur (FCFA, sous-total)</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={form.triggerMinAmount}
                    onChange={(e) => setForm((f) => ({ ...f, triggerMinAmount: Number(e.target.value) }))}
                    className="h-9"
                  />
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel required>Produit proposé</FieldLabel>
                {listsLoaded ? (
                  <ProductSingleSelect
                    products={products}
                    value={form.offerProductId}
                    onChange={(id) => setForm((f) => ({ ...f, offerProductId: id, specialPrice: f.specialPrice || 0 }))}
                  />
                ) : (
                  <Skeleton className="h-9 w-full" />
                )}
                <FieldHint text="Un produit déjà présent dans la commande n'est jamais reproposé (anti-doublon)." />
              </div>
              <div className="space-y-1.5">
                <FieldLabel required>Prix spécial (FCFA)</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  value={form.specialPrice}
                  onChange={(e) => setForm((f) => ({ ...f, specialPrice: Number(e.target.value) }))}
                  className="h-9"
                />
                {normalPrice !== null && (
                  <p className="text-xs">
                    Prix normal : <span className="line-through text-muted-foreground">{formatXOF(normalPrice)}</span>{" "}
                    {savings !== null && savings > 0 ? (
                      <span className="font-semibold text-emerald-700">
                        → économie de {formatXOF(savings)} ({savingsPercent} %)
                      </span>
                    ) : (
                      <span className="text-rose-600">— le prix spécial doit être inférieur</span>
                    )}
                  </p>
                )}
                <FieldHint text="L'économie affichée au client est calculée en direct sur le prix courant du produit." />
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel required>Message commercial</FieldLabel>
              <Textarea
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                rows={3}
                maxLength={1000}
                placeholder="Votre Nova X5 Pro mérite la meilleure protection : le pack de 2 verres trempés à -29 %, ajouté à la même livraison."
              />
              <FieldHint text="Argumentaire affiché au client au moment du choix." />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Image (URL, optionnel)</FieldLabel>
                <Input
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://…"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Acceptations max (global)</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={form.maxAccepts ?? ""}
                  placeholder="Illimité"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxAccepts: e.target.value === "" ? null : Number(e.target.value) }))
                  }
                  className="h-9"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Début</FieldLabel>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Fin</FieldLabel>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center space-x-2">
                <Switch
                  id="upsell-thankyou"
                  checked={form.showOnThankYou}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, showOnThankYou: v }))}
                />
                <label htmlFor="upsell-thankyou" className="cursor-pointer text-sm">
                  Page de remerciement
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="upsell-cart"
                  checked={form.showInCart}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, showInCart: v }))}
                />
                <label htmlFor="upsell-cart" className="cursor-pointer text-sm">
                  Panier
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="upsell-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
                <label htmlFor="upsell-active" className="cursor-pointer text-sm">
                  Active
                </label>
              </div>
              <div className="flex items-center gap-2">
                <FieldLabel>Position</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: Number(e.target.value) }))}
                  className="h-8 w-20"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={busy || !listsLoaded || !form.offerProductId}>
              {editing ? "Enregistrer" : "Créer l'offre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
