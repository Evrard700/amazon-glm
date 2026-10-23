"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Archive, Copy, History, MoreHorizontal, Pencil, Plus, TicketPercent, Trash2 } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { AdminPageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { useAdminApi } from "@/components/admin/api-client"
import { StatCard } from "@/components/admin/stat-card"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"
import {
  ActiveBadge,
  CopyableCode,
  CouponTypeBadge,
  couponValueLabel,
  FieldHint,
  FieldLabel,
  formatDateFR,
  MarketingEmptyState,
  ScopeBadge,
  TableActionButton,
  ToneBadge,
  toLocalInputValue,
} from "@/components/admin/marketing/helpers"
import {
  CategoryMultiPicker,
  ClientSingleSelect,
  ProductMultiPicker,
  ProductSingleSelect,
} from "@/components/admin/marketing/entity-picker"
import { useLightLists } from "@/components/admin/marketing/use-light-lists"

interface AdminCoupon {
  id: string
  code: string
  type: "PERCENT" | "FIXED" | "FREE_SHIPPING" | "FREE_PRODUCT"
  value: number
  description: string | null
  appliesTo: "ALL" | "PRODUCTS" | "CATEGORIES"
  productIds: string[]
  categoryIds: string[]
  minOrderAmount: number
  maxUses: number | null
  usedCount: number
  perCustomerLimit: number
  freeProductId: string | null
  startsAt: string | null
  expiresAt: string | null
  isActive: boolean
  targetUser: { id: string; name: string; email: string } | null
  createdAt: string
  redemptionCount: number
}

interface RedemptionRow {
  id: string
  couponCode: string
  couponType: string
  couponValue: number
  user: { name: string; email: string } | null
  orderNumber: string
  orderTotal: number
  createdAt: string
}

interface CouponForm {
  code: string
  type: AdminCoupon["type"]
  value: number
  description: string
  appliesTo: AdminCoupon["appliesTo"]
  productIds: string[]
  categoryIds: string[]
  minOrderAmount: number
  maxUses: number | null
  perCustomerLimit: number
  freeProductId: string | null
  startsAt: string
  expiresAt: string
  isActive: boolean
  userId: string | null
}

const TYPE_CARDS: { value: AdminCoupon["type"]; title: string; desc: string }[] = [
  { value: "PERCENT", title: "Pourcentage", desc: "−X % sur le panier éligible" },
  { value: "FIXED", title: "Montant fixe", desc: "−X FCFA dès le montant minimum" },
  { value: "FREE_SHIPPING", title: "Livraison offerte", desc: "Frais de livraison à 0 FCFA" },
  { value: "FREE_PRODUCT", title: "Produit offert", desc: "Un article ajouté gratuitement" },
]

const emptyForm: CouponForm = {
  code: "",
  type: "PERCENT",
  value: 10,
  description: "",
  appliesTo: "ALL",
  productIds: [],
  categoryIds: [],
  minOrderAmount: 0,
  maxUses: null,
  perCustomerLimit: 1,
  freeProductId: null,
  startsAt: "",
  expiresAt: "",
  isActive: true,
  userId: null,
}

function generateCode(prefix = "PROMO"): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let suffix = ""
  for (let i = 0; i < 6; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)]
  return `${prefix}-${suffix}`
}

export default function CouponsPage() {
  const api = useAdminApi()
  const { products, categories, clients, loaded: listsLoaded } = useLightLists({
    products: true,
    categories: true,
    clients: true,
  })

  const [coupons, setCoupons] = useState<AdminCoupon[]>([])
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminCoupon | null>(null)
  const [form, setForm] = useState<CouponForm>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminCoupon | null>(null)

  const load = useCallback(async () => {
    const data = await api.get<{ coupons: AdminCoupon[]; redemptions: RedemptionRow[] }>(
      "/api/admin/marketing/coupons",
    )
    if (data) {
      setCoupons(data.coupons)
      setRedemptions(data.redemptions)
    }
    setLoading(false)
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, code: generateCode() })
    setDialogOpen(true)
  }

  const openEdit = (c: AdminCoupon) => {
    setEditing(c)
    setForm({
      code: c.code,
      type: c.type,
      value: c.value,
      description: c.description ?? "",
      appliesTo: c.appliesTo,
      productIds: c.productIds,
      categoryIds: c.categoryIds,
      minOrderAmount: c.minOrderAmount,
      maxUses: c.maxUses,
      perCustomerLimit: c.perCustomerLimit,
      freeProductId: c.freeProductId,
      startsAt: toLocalInputValue(c.startsAt),
      expiresAt: toLocalInputValue(c.expiresAt),
      isActive: c.isActive,
      userId: c.targetUser?.id ?? null,
    })
    setDialogOpen(true)
  }

  const validateForm = (): string | null => {
    if (form.code.trim().length < 3) return "Le code doit contenir au moins 3 caractères."
    if (!/^[A-Za-z0-9-]+$/.test(form.code.trim())) return "Le code ne peut contenir que des lettres, chiffres et tirets."
    if (form.type === "PERCENT" && (form.value < 1 || form.value > 100)) return "Un pourcentage doit être compris entre 1 et 100."
    if (form.type === "FIXED" && form.value <= 0) return "Le montant fixe doit être supérieur à 0 FCFA."
    if (form.type === "FREE_PRODUCT" && !form.freeProductId) return "Choisissez le produit offert."
    if (form.appliesTo === "PRODUCTS" && form.productIds.length === 0) return "Sélectionnez au moins un produit concerné."
    if (form.appliesTo === "CATEGORIES" && form.categoryIds.length === 0) return "Sélectionnez au moins une catégorie concernée."
    if (form.minOrderAmount < 0) return "Le montant minimum ne peut pas être négatif."
    if (form.startsAt && form.expiresAt && new Date(form.expiresAt) <= new Date(form.startsAt)) {
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
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: form.type === "PERCENT" || form.type === "FIXED" ? Math.round(form.value) : 0,
      description: form.description.trim() || null,
      appliesTo: form.appliesTo,
      productIds: form.appliesTo === "PRODUCTS" ? form.productIds : [],
      categoryIds: form.appliesTo === "CATEGORIES" ? form.categoryIds : [],
      minOrderAmount: Math.max(0, Math.round(form.minOrderAmount)),
      maxUses: form.maxUses === null ? null : Math.max(1, Math.round(form.maxUses)),
      perCustomerLimit: Math.max(0, Math.round(form.perCustomerLimit)),
      freeProductId: form.type === "FREE_PRODUCT" ? form.freeProductId : null,
      startsAt: form.startsAt || null,
      expiresAt: form.expiresAt || null,
      isActive: form.isActive,
      userId: form.userId,
    }
    const data = editing
      ? await api.patch(`/api/admin/marketing/coupons/${editing.id}`, payload)
      : await api.post("/api/admin/marketing/coupons", payload)
    if (data) {
      toast.success(
        editing ? `Code ${payload.code} mis à jour.` : `Code ${payload.code} créé${payload.userId ? " (réservé à ce client)" : ""}.`,
      )
      setDialogOpen(false)
      void load()
    }
    setBusy(false)
  }

  const toggleActive = async (c: AdminCoupon) => {
    const data = await api.patch(`/api/admin/marketing/coupons/${c.id}`, { isActive: !c.isActive })
    if (data) {
      toast.success(`${c.code} ${!c.isActive ? "réactivé" : "désactivé (archivé)"}.`)
      void load()
    }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    const data = await api.del(`/api/admin/marketing/coupons/${deleteTarget.id}`)
    if (data) {
      toast.success(`Code ${deleteTarget.code} supprimé.`)
    }
    setDeleteTarget(null)
    setBusy(false)
    void load()
  }

  const archive = async (c: AdminCoupon) => {
    const data = await api.patch(`/api/admin/marketing/coupons/${c.id}`, { isActive: false })
    if (data) {
      toast.success(`${c.code} archivé (désactivé) — l'historique des remises est conservé.`)
      void load()
    }
  }

  const columns: ColumnDef<AdminCoupon, unknown>[] = [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <CopyableCode code={row.original.code} />
            {row.original.description && (
              <p className="max-w-56 truncate text-xs text-muted-foreground" title={row.original.description}>
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => <CouponTypeBadge type={row.original.type} value={row.original.value} />,
      },
      {
        accessorKey: "value",
        header: "Valeur",
        cell: ({ row }) => (
          <span className="text-sm font-semibold">{couponValueLabel(row.original.type, row.original.value)}</span>
        ),
      },
      {
        accessorKey: "minOrderAmount",
        header: "Min. commande",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.minOrderAmount > 0 ? formatXOF(row.original.minOrderAmount) : "—"}
          </span>
        ),
      },
      {
        accessorKey: "usedCount",
        header: "Utilisations",
        cell: ({ row }) => (
          <span className="flex items-center text-xs tabular-nums">
            {row.original.usedCount}
            {row.original.maxUses !== null ? ` / ${row.original.maxUses}` : " / ∞"}
            {row.original.maxUses !== null && row.original.usedCount >= row.original.maxUses && (
              <ToneBadge tone="neutral" className="ml-1.5">épuisé</ToneBadge>
            )}
          </span>
        ),
      },
      {
        accessorKey: "perCustomerLimit",
        header: "Par client",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.perCustomerLimit === 0 ? "Illimité" : row.original.perCustomerLimit === 1 ? "1 fois" : `${row.original.perCustomerLimit} fois`}
          </span>
        ),
      },
      {
        accessorKey: "appliesTo",
        header: "Cible",
        cell: ({ row }) => (
          <ScopeBadge
            appliesTo={row.original.appliesTo}
            count={row.original.appliesTo === "PRODUCTS" ? row.original.productIds.length : row.original.categoryIds.length}
            targetUser={row.original.targetUser?.name ?? null}
          />
        ),
      },
      {
        id: "periode",
        header: "Période",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.startsAt || row.original.expiresAt ? (
              <>
                {row.original.startsAt ? formatDateFR(row.original.startsAt) : "—"}
                {" → "}
                {row.original.expiresAt ? formatDateFR(row.original.expiresAt) : "∞"}
              </>
            ) : (
              "Sans dates"
            )}
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
          const c = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <TableActionButton label="Modifier" tone="brand" onClick={() => openEdit(c)} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => toggleActive(c)}>
                    {c.isActive ? "Désactiver (archiver)" : "Réactiver"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openEdit(c)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Modifier
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-rose-600 focus:text-rose-700"
                    onClick={() => setDeleteTarget(c)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ]

  const historyColumns = useMemo<ColumnDef<RedemptionRow, unknown>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Date",
        cell: ({ row }) => <span className="text-xs">{formatDateFR(row.original.createdAt)}</span>,
      },
      {
        accessorKey: "couponCode",
        header: "Code",
        cell: ({ row }) => <CopyableCode code={row.original.couponCode} />,
      },
      {
        accessorKey: "couponValue",
        header: "Réduction",
        cell: ({ row }) => (
          <span className="text-sm font-semibold">{couponValueLabel(row.original.couponType, row.original.couponValue)}</span>
        ),
      },
      {
        accessorKey: "user",
        header: "Client",
        cell: ({ row }) => (
          <div className="min-w-40">
            {row.original.user ? (
              <>
                <p className="text-sm leading-tight">{row.original.user.name}</p>
                <p className="text-xs text-muted-foreground">{row.original.user.email}</p>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Compte supprimé / invité</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "orderNumber",
        header: "Commande",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.orderNumber}</span>,
      },
      {
        accessorKey: "orderTotal",
        header: "Montant commande",
        cell: ({ row }) => <span className="text-xs tabular-nums">{formatXOF(row.original.orderTotal)}</span>,
      },
    ],
    [],
  )

  const activeCount = coupons.filter((c) => c.isActive).length
  const totalRedemptions = coupons.reduce((s, c) => s + c.usedCount, 0)
  const personalCoupons = coupons.filter((c) => c.targetUser).length

  return (
    <div>
      <AdminPageHeader
        title="Codes promo"
        description="Réductions en FCFA : pourcentage, montant fixe, livraison offerte ou produit offert — ciblage client et périmètre catalogue."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Nouveau code promo
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Codes actifs" value={activeCount} icon={TicketPercent} loading={loading} />
        <StatCard label="Codes créés" value={coupons.length} icon={Copy} loading={loading} />
        <StatCard label="Utilisations cumulées" value={totalRedemptions} icon={History} loading={loading} />
        <StatCard label="Coupons personnels" value={personalCoupons} hint="réservés à un client précis" loading={loading} />
      </div>

      <Tabs defaultValue="codes">
        <TabsList>
          <TabsTrigger value="codes">Codes promo ({coupons.length})</TabsTrigger>
          <TabsTrigger value="historique">Historique ({redemptions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="codes" className="mt-4">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : coupons.length === 0 ? (
            <MarketingEmptyState
              icon={TicketPercent}
              title="Aucun code promo"
              description="Créez votre premier code : un pourcentage de bienvenue, une livraison offerte dès un certain montant, ou un produit offert ciblé."
              action={
                <Button onClick={openCreate} size="sm">
                  <Plus className="mr-1.5 h-4 w-4" /> Créer un code
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={coupons}
              loading={loading}
              searchPlaceholder="Rechercher un code, une description…"
              emptyMessage="Aucun code promo ne correspond."
              pageSize={10}
            />
          )}
        </TabsContent>

        <TabsContent value="historique" className="mt-4">
          <p className="mb-3 text-xs text-muted-foreground">
            Chaque utilisation est liée à une commande réelle — les remises accordées restent traçables même après archivage du code.
          </p>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : redemptions.length === 0 ? (
            <MarketingEmptyState
              icon={History}
              title="Aucune utilisation"
              description="Les utilisations apparaîtront ici dès qu'un client appliquera un code promo à une commande."
            />
          ) : (
            <DataTable
              columns={historyColumns}
              data={redemptions}
              loading={loading}
              searchPlaceholder="Rechercher un code, un client, une commande…"
              emptyMessage="Aucune utilisation."
              pageSize={10}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* ---------- Dialog formulaire ---------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[min(44rem,95vw)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Modifier ${editing.code}` : "Nouveau code promo"}</DialogTitle>
            <DialogDescription>
              Tout est recalculé côté serveur au moment de l'application : le client ne peut jamais obtenir une réduction supérieure à celle définie ici.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Code */}
            <div className="space-y-1.5">
              <FieldLabel required>Code</FieldLabel>
              <div className="flex gap-2">
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="BIENVENUE10"
                  className="h-9 font-mono font-semibold uppercase"
                  maxLength={30}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0"
                  onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Générer
                </Button>
              </div>
              <FieldHint text="Lettres, chiffres et tirets. Le client saisira ce code exact lors du paiement." />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <FieldLabel required>Type de réduction</FieldLabel>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {TYPE_CARDS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                    className={cn(
                      "rounded-xl border p-3 text-left transition",
                      form.type === t.value
                        ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                        : "hover:border-amber-200 hover:bg-secondary/60",
                    )}
                  >
                    <p className="text-sm font-semibold leading-tight">{t.title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Valeur */}
            {form.type === "PERCENT" || form.type === "FIXED" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel required>{form.type === "PERCENT" ? "Pourcentage (%)" : "Montant (FCFA)"}</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    max={form.type === "PERCENT" ? 100 : undefined}
                    value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))}
                    className="h-9"
                  />
                  <FieldHint
                    text={
                      form.type === "PERCENT"
                        ? "Appliqué au sous-total des articles éligibles, arrondi au FCFA (demi-sup)."
                        : "Déduit du panier éligible, plafonné au montant de la commande."
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Montant minimum de commande (FCFA)</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    value={form.minOrderAmount}
                    onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: Number(e.target.value) }))}
                    className="h-9"
                  />
                  <FieldHint text="0 = aucune condition. Le minimum est vérifié sur la base éligible." />
                </div>
              </div>
            ) : form.type === "FREE_PRODUCT" ? (
              <div className="space-y-1.5">
                <FieldLabel required>Produit offert</FieldLabel>
                {listsLoaded ? (
                  <ProductSingleSelect
                    products={products}
                    value={form.freeProductId}
                    onChange={(id) => setForm((f) => ({ ...f, freeProductId: id }))}
                    placeholder="Choisir le produit offert…"
                  />
                ) : (
                  <Skeleton className="h-9 w-full" />
                )}
                <FieldHint text="Le produit est ajouté gratuitement à la commande ; son stock doit être disponible." />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel>Montant minimum de commande (FCFA)</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    value={form.minOrderAmount}
                    onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: Number(e.target.value) }))}
                    className="h-9"
                  />
                  <FieldHint text="Ex. : livraison offerte dès 30 000 FCFA d'achat." />
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <FieldLabel>Description</FieldLabel>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="10 % de bienvenue, dès 20 000 FCFA d'achat"
                rows={2}
                maxLength={500}
              />
              <FieldHint text="Affichée à l'équipe et au client lors de l'application du code." />
            </div>

            {/* Périmètre */}
            <div className="space-y-1.5">
              <FieldLabel>Périmètre d'application</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { value: "ALL", label: "Tout le catalogue" },
                    { value: "PRODUCTS", label: "Produits précis" },
                    { value: "CATEGORIES", label: "Catégories" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, appliesTo: s.value }))}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition",
                      form.appliesTo === s.value
                        ? "border-amber-400 bg-amber-100 text-amber-900"
                        : "hover:bg-secondary",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {form.appliesTo === "PRODUCTS" && (
                <div className="pt-1">
                  {listsLoaded ? (
                    <ProductMultiPicker
                      products={products}
                      selected={form.productIds}
                      onChange={(ids) => setForm((f) => ({ ...f, productIds: ids }))}
                    />
                  ) : (
                    <Skeleton className="h-9 w-full" />
                  )}
                </div>
              )}
              {form.appliesTo === "CATEGORIES" && (
                <div className="pt-1">
                  {listsLoaded ? (
                    <CategoryMultiPicker
                      categories={categories}
                      selected={form.categoryIds}
                      onChange={(ids) => setForm((f) => ({ ...f, categoryIds: ids }))}
                    />
                  ) : (
                    <Skeleton className="h-9 w-full" />
                  )}
                </div>
              )}
              <FieldHint text="La réduction s'applique uniquement aux articles du périmètre (base de calcul du minimum et du pourcentage)." />
            </div>

            {/* Limites */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Utilisations maximales (global)</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={form.maxUses ?? ""}
                  placeholder="Illimité"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxUses: e.target.value === "" ? null : Number(e.target.value) }))
                  }
                  className="h-9"
                />
                <FieldHint text="Vide = illimité. Utile pour une offre flash à volume limité." />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Limite par client</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  value={form.perCustomerLimit}
                  onChange={(e) => setForm((f) => ({ ...f, perCustomerLimit: Number(e.target.value) }))}
                  className="h-9"
                />
                <FieldHint text="0 = illimité par client. 1 = usage unique par compte." />
              </div>
            </div>

            {/* Dates */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Début de validité</FieldLabel>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  className="h-9"
                />
                <FieldHint text="Vide = actif dès maintenant." />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Fin de validité</FieldLabel>
                <Input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  className="h-9"
                />
                <FieldHint text="Vide = sans expiration." />
              </div>
            </div>

            {/* Ciblage client + actif */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Client ciblé (optionnel)</FieldLabel>
                {listsLoaded ? (
                  <ClientSingleSelect
                    clients={clients}
                    value={form.userId}
                    onChange={(id) => setForm((f) => ({ ...f, userId: id }))}
                  />
                ) : (
                  <Skeleton className="h-9 w-full" />
                )}
                <FieldHint text="Réservé à un seul client (dédommagement, récompense). Personne d'autre ne pourra l'utiliser." />
              </div>
              <div className="flex items-end space-x-2 pb-1">
                <Switch
                  id="coupon-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
                <Label htmlFor="coupon-active" className="cursor-pointer text-sm">
                  Code actif
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={busy || !listsLoaded}>
              {editing ? "Enregistrer" : "Créer le code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Confirmation suppression ---------- */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer « {deleteTarget?.code} » ?</DialogTitle>
            <DialogDescription>
              {deleteTarget && deleteTarget.usedCount > 0
                ? "Ce code a déjà été utilisé : la suppression sera refusée par le serveur pour préserver l'historique comptable. Archivez-le plutôt (désactivation)."
                : "Action irréversible. Un code jamais utilisé peut être supprimé proprement."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            {deleteTarget && deleteTarget.usedCount > 0 && (
              <Button variant="outline" onClick={() => deleteTarget && archive(deleteTarget)}>
                <Archive className="mr-1.5 h-4 w-4" /> Archiver (désactiver)
              </Button>
            )}
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Retour
            </Button>
            {deleteTarget && deleteTarget.usedCount === 0 && (
              <Button variant="destructive" onClick={doDelete} disabled={busy}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Supprimer définitivement
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
