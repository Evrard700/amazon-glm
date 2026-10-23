"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import {
  ArrowRight,
  BadgePercent,
  FlaskConical,
  Gift,
  MoreHorizontal,
  Pencil,
  Percent,
  Plus,
  Sparkles,
  Trash2,
  TrendingDown,
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
  ScopeBadge,
  TableActionButton,
  ToneBadge,
  toLocalInputValue,
} from "@/components/admin/marketing/helpers"
import {
  CategoryMultiPicker,
  ProductMultiPicker,
  ProductSingleSelect,
  QtyStepper,
  type LightProduct,
} from "@/components/admin/marketing/entity-picker"
import { useLightLists } from "@/components/admin/marketing/use-light-lists"
import { PROMOTION_RULE_LABELS } from "@/lib/constants"

interface AdminPromotion {
  id: string
  name: string
  description: string | null
  ruleType: "BUY_X_GET_Y_SAME" | "BUY_X_GET_PRODUCT_FREE" | "BUY_X_GET_PRODUCT_DISCOUNT"
  requiredQty: number
  rewardQty: number
  rewardProductId: string | null
  discountPercent: number | null
  appliesTo: "ALL" | "PRODUCTS" | "CATEGORIES"
  productIds: string[]
  categoryIds: string[]
  minOrderAmount: number
  priority: number
  combinable: boolean
  maxUses: number | null
  usedCount: number
  perCustomerLimit: number
  badgeLabel: string | null
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  createdAt: string
}

interface SimulateResult {
  subtotal: number
  discount: number
  totalAfter: number
  applications: {
    promotionId: string
    name: string
    badgeLabel?: string
    amount: number
    description: string
    freeLine: { productId: string; productName: string; unitPrice: number; quantity: number; message: string } | null
    discountedLine: { productId: string; productName: string; unitPrice: number; quantity: number; discountPerUnit: number; message: string } | null
  }[]
}

const RULE_CARDS = [
  {
    value: "BUY_X_GET_Y_SAME" as const,
    title: "Achetez X, obtenez Y",
    desc: "Les Y unités les moins chères de la sélection sont offertes (ex. : 4 payés → le moins cher offert).",
    icon: Gift,
  },
  {
    value: "BUY_X_GET_PRODUCT_FREE" as const,
    title: "Achetez X → produit offert",
    desc: "Un produit désigné est ajouté gratuitement à la commande dès X articles déclencheurs.",
    icon: Gift,
  },
  {
    value: "BUY_X_GET_PRODUCT_DISCOUNT" as const,
    title: "Achetez X → produit à −Y %",
    desc: "Un produit désigné est proposé avec une réduction en pourcentage.",
    icon: Percent,
  },
]

const emptyForm = {
  name: "",
  description: "",
  ruleType: "BUY_X_GET_PRODUCT_FREE" as AdminPromotion["ruleType"],
  requiredQty: 2,
  rewardQty: 1,
  rewardProductId: null as string | null,
  discountPercent: 40 as number | null,
  appliesTo: "PRODUCTS" as AdminPromotion["appliesTo"],
  productIds: [] as string[],
  categoryIds: [] as string[],
  minOrderAmount: 0,
  priority: 10,
  combinable: true,
  badgeLabel: "",
  startsAt: "",
  endsAt: "",
  maxUses: null as number | null,
  perCustomerLimit: 0,
  isActive: true,
}

export default function PromotionsPage() {
  const api = useAdminApi()
  const { products, categories, loaded: listsLoaded } = useLightLists({ products: true, categories: true })

  const [promos, setPromos] = useState<AdminPromotion[]>([])
  const [stats, setStats] = useState({ activeCount: 0, totalUses: 0, totalGenerated: 0 })
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminPromotion | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  // Simulateur
  const [simProductId, setSimProductId] = useState<string | null>(null)
  const [simQty, setSimQty] = useState(2)
  const [simLines, setSimLines] = useState<{ productId: string; qty: number }[]>([])
  const [simResult, setSimResult] = useState<SimulateResult | null>(null)
  const [simBusy, setSimBusy] = useState(false)

  const load = useCallback(async () => {
    const data = await api.get<{ stats: typeof stats; promotions: AdminPromotion[] }>(
      "/api/admin/marketing/promotions",
    )
    if (data) {
      setPromos(data.promotions)
      setStats(data.stats)
    }
    setLoading(false)
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const productName = useCallback(
    (id: string | null) => products.find((p) => p.id === id)?.name ?? null,
    [products],
  )

  /** Détail humain de la règle, ex. « Achetez 2 → Coque Protect+ offerte ». */
  const ruleDetail = useCallback(
    (p: AdminPromotion): string => {
      const reward = p.rewardProductId ? productName(p.rewardProductId) : null
      if (p.ruleType === "BUY_X_GET_Y_SAME") {
        return `Achetez ${p.requiredQty} → ${p.rewardQty} unité${p.rewardQty > 1 ? "s" : ""} la${p.rewardQty > 1 ? "s" : ""} moins chère${p.rewardQty > 1 ? "s" : ""} offerte${p.rewardQty > 1 ? "s" : ""} dans la sélection`
      }
      if (p.ruleType === "BUY_X_GET_PRODUCT_FREE") {
        return `Achetez ${p.requiredQty} → ${reward ?? "produit désigné"} offerte${p.rewardQty > 1 ? ` ×${p.rewardQty}` : ""}`
      }
      return `Achetez ${p.requiredQty} → ${reward ?? "produit désigné"} à −${p.discountPercent ?? 0} %`
    },
    [productName],
  )

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setDialogOpen(true)
  }

  const openEdit = (p: AdminPromotion) => {
    setEditing(p)
    setForm({
      name: p.name,
      description: p.description ?? "",
      ruleType: p.ruleType,
      requiredQty: p.requiredQty,
      rewardQty: p.rewardQty,
      rewardProductId: p.rewardProductId,
      discountPercent: p.discountPercent,
      appliesTo: p.appliesTo,
      productIds: p.productIds,
      categoryIds: p.categoryIds,
      minOrderAmount: p.minOrderAmount,
      priority: p.priority,
      combinable: p.combinable,
      badgeLabel: p.badgeLabel ?? "",
      startsAt: toLocalInputValue(p.startsAt),
      endsAt: toLocalInputValue(p.endsAt),
      maxUses: p.maxUses,
      perCustomerLimit: p.perCustomerLimit,
      isActive: p.isActive,
    })
    setDialogOpen(true)
  }

  const validateForm = (): string | null => {
    if (form.name.trim().length < 3) return "Le nom doit contenir au moins 3 caractères."
    if (form.requiredQty < 1 || form.rewardQty < 1) return "Les quantités doivent être ≥ 1."
    if (form.ruleType !== "BUY_X_GET_Y_SAME" && !form.rewardProductId) return "Choisissez le produit offert / réduit."
    if (form.ruleType === "BUY_X_GET_PRODUCT_DISCOUNT" && (form.discountPercent === null || form.discountPercent < 1 || form.discountPercent > 100)) {
      return "Le pourcentage de réduction doit être compris entre 1 et 100."
    }
    if (form.appliesTo === "PRODUCTS" && form.productIds.length === 0) return "Sélectionnez au moins un produit déclencheur."
    if (form.appliesTo === "CATEGORIES" && form.categoryIds.length === 0) return "Sélectionnez au moins une catégorie déclencheuse."
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
      description: form.description.trim() || null,
      ruleType: form.ruleType,
      requiredQty: Math.max(1, Math.round(form.requiredQty)),
      rewardQty: Math.max(1, Math.round(form.rewardQty)),
      rewardProductId: form.ruleType === "BUY_X_GET_Y_SAME" ? null : form.rewardProductId,
      discountPercent: form.ruleType === "BUY_X_GET_PRODUCT_DISCOUNT" ? form.discountPercent : null,
      appliesTo: form.appliesTo,
      productIds: form.appliesTo === "PRODUCTS" ? form.productIds : [],
      categoryIds: form.appliesTo === "CATEGORIES" ? form.categoryIds : [],
      minOrderAmount: Math.max(0, Math.round(form.minOrderAmount)),
      priority: Math.round(form.priority),
      combinable: form.combinable,
      badgeLabel: form.badgeLabel.trim() || null,
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      maxUses: form.maxUses === null ? null : Math.max(1, Math.round(form.maxUses)),
      perCustomerLimit: Math.max(0, Math.round(form.perCustomerLimit)),
      isActive: form.isActive,
    }
    const data = editing
      ? await api.patch(`/api/admin/marketing/promotions/${editing.id}`, payload)
      : await api.post("/api/admin/marketing/promotions", payload)
    if (data) {
      toast.success(editing ? "Promotion mise à jour." : "Promotion créée.")
      setDialogOpen(false)
      void load()
    }
    setBusy(false)
  }

  const toggleActive = async (p: AdminPromotion) => {
    const data = await api.patch(`/api/admin/marketing/promotions/${p.id}`, { isActive: !p.isActive })
    if (data) {
      toast.success(`« ${p.name} » ${!p.isActive ? "activée" : "désactivée"}.`)
      void load()
    }
  }

  const doDelete = async (p: AdminPromotion) => {
    const data = await api.del(`/api/admin/marketing/promotions/${p.id}`)
    if (data) {
      toast.success(`« ${p.name} » supprimée.`)
      void load()
    }
  }

  // ---------- Simulateur ----------
  const addSimLine = () => {
    if (!simProductId) {
      toast.error("Choisissez d'abord un produit à ajouter au panier simulé.")
      return
    }
    if (simLines.length >= 10) {
      toast.error("10 lignes maximum dans le panier simulé.")
      return
    }
    const existing = simLines.find((l) => l.productId === simProductId)
    if (existing) {
      setSimLines((lines) => lines.map((l) => (l.productId === simProductId ? { ...l, qty: l.qty + simQty } : l)))
    } else {
      setSimLines((lines) => [...lines, { productId: simProductId, qty: simQty }])
    }
    setSimProductId(null)
    setSimQty(2)
  }

  const runSimulation = async () => {
    if (simLines.length === 0) {
      toast.error("Ajoutez au moins un article au panier simulé.")
      return
    }
    setSimBusy(true)
    const data = await api.post<SimulateResult>("/api/admin/marketing/promotions/simulate", {
      lines: simLines,
    })
    if (data) {
      setSimResult(data)
      if (data.applications.length === 0) {
        toast.info("Aucune promotion active ne s'applique à ce panier (conditions non remplies).")
      }
    }
    setSimBusy(false)
  }

  const columns: ColumnDef<AdminPromotion, unknown>[] = [
      {
        accessorKey: "name",
        header: "Promotion",
        cell: ({ row }) => (
          <div className="min-w-52">
            <p className="font-medium leading-tight">{row.original.name}</p>
            {row.original.description && (
              <p className="mt-0.5 max-w-72 truncate text-xs text-muted-foreground" title={row.original.description}>
                {row.original.description}
              </p>
            )}
            {row.original.badgeLabel && (
              <ToneBadge tone="brand" className="mt-1">{row.original.badgeLabel}</ToneBadge>
            )}
          </div>
        ),
      },
      {
        id: "rule",
        header: "Règle",
        cell: ({ row }) => (
          <div className="max-w-72 space-y-0.5">
            <ToneBadge tone="ok">{PROMOTION_RULE_LABELS[row.original.ruleType].split(" (")[0]}</ToneBadge>
            <p className="text-xs leading-snug text-muted-foreground">{ruleDetail(row.original)}</p>
          </div>
        ),
      },
      {
        accessorKey: "appliesTo",
        header: "Périmètre",
        cell: ({ row }) => (
          <ScopeBadge
            appliesTo={row.original.appliesTo}
            count={row.original.appliesTo === "PRODUCTS" ? row.original.productIds.length : row.original.categoryIds.length}
          />
        ),
      },
      {
        accessorKey: "usedCount",
        header: "Utilisations",
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.usedCount}
            {row.original.maxUses !== null ? ` / ${row.original.maxUses}` : " / ∞"}
          </span>
        ),
      },
      {
        accessorKey: "priority",
        header: "Priorité",
        cell: ({ row }) => <span className="text-xs tabular-nums">n°{row.original.priority}</span>,
      },
      {
        accessorKey: "combinable",
        header: "Cumulable",
        cell: ({ row }) =>
          row.original.combinable ? (
            <ToneBadge tone="ok">Oui</ToneBadge>
          ) : (
            <ToneBadge tone="neutral">Exclusive</ToneBadge>
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
          const p = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <TableActionButton label="Modifier" tone="brand" onClick={() => openEdit(p)} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => toggleActive(p)}>
                    {p.isActive ? "Désactiver" : "Activer"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openEdit(p)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Modifier
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-rose-600 focus:text-rose-700"
                    disabled={p.usedCount > 0}
                    onClick={() => doDelete(p)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    {p.usedCount > 0 ? "Suppression bloquée (utilisée)" : "Supprimer"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ]

  return (
    <div>
      <AdminPageHeader
        title="Promotions « Achetez X, obtenez Y »"
        description="Offres automatiques appliquées au panier par le moteur serveur : articles offerts ou réduits, cumulables ou exclusives."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Nouvelle promotion
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label="Promotions actives" value={stats.activeCount} icon={Sparkles} loading={loading} />
        <StatCard label="Utilisations cumulées" value={stats.totalUses} icon={BadgePercent} loading={loading} />
        <StatCard
          label="Réduction totale générée"
          value={stats.totalGenerated}
          isCurrency
          icon={TrendingDown}
          hint="somme des remises BXGY enregistrées sur les commandes"
          loading={loading}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : promos.length === 0 ? (
            <MarketingEmptyState
              icon={Gift}
              title="Aucune promotion"
              description="Créez une règle « Achetez X, obtenez Y » : articles offerts dans la sélection, produit cadeau, ou produit désigné à tarif réduit."
              action={
                <Button onClick={openCreate} size="sm">
                  <Plus className="mr-1.5 h-4 w-4" /> Créer une promotion
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={promos}
              loading={loading}
              searchPlaceholder="Rechercher une promotion…"
              emptyMessage="Aucune promotion ne correspond."
              pageSize={10}
            />
          )}
        </div>

        {/* ---------- Simulateur (signature du module) ---------- */}
        <aside className="rounded-xl border bg-card p-4 shadow-sm xl:sticky xl:top-20">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-lg bg-brand-soft p-1.5 text-brand-foreground">
              <FlaskConical className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="text-sm font-bold leading-tight">Simulateur</h3>
              <p className="text-xs text-muted-foreground">Aperçu fidèle du moteur réel</p>
            </div>
          </div>

          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            Composez un panier fictif : le serveur recalcule avec les prix de la base et la même logique que le
            checkout. Aucune donnée n'est enregistrée.
          </p>

          <div className="space-y-2">
            {listsLoaded ? (
              <ProductSingleSelect
                products={products}
                value={simProductId}
                onChange={setSimProductId}
                placeholder="Choisir un produit…"
              />
            ) : (
              <Skeleton className="h-9 w-full" />
            )}
            <div className="flex items-center justify-between gap-2">
              <QtyStepper value={simQty} onChange={setSimQty} min={1} max={20} />
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={addSimLine}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter
              </Button>
            </div>

            {simLines.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                {simLines.map((l) => {
                  const p = products.find((x) => x.id === l.productId)
                  return (
                    <div key={l.productId} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-2 py-1.5 text-xs">
                      <span className="min-w-0 flex-1 truncate">
                        {l.qty} × {p?.name ?? "produit"}
                      </span>
                      <button
                        type="button"
                        className="text-muted-foreground transition hover:text-rose-600"
                        aria-label="Retirer"
                        onClick={() => setSimLines((lines) => lines.filter((x) => x.productId !== l.productId))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <Button onClick={runSimulation} disabled={simBusy || simLines.length === 0} className="w-full">
              {simBusy ? "Calcul en cours…" : "Simuler le panier"}
            </Button>
          </div>

          {simResult && (
            <div className="mt-4 space-y-3 border-t pt-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-secondary/60 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Panier</p>
                  <p className="text-sm font-bold tabular-nums">{formatXOF(simResult.subtotal)}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700">Remise</p>
                  <p className="text-sm font-bold tabular-nums text-emerald-700">−{formatXOF(simResult.discount)}</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-amber-700">À payer</p>
                  <p className="text-sm font-bold tabular-nums text-amber-700">{formatXOF(simResult.totalAfter)}</p>
                </div>
              </div>

              {simResult.applications.length > 0 ? (
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {simResult.applications.map((app) => (
                    <div key={app.promotionId} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-emerald-800">{app.name}</p>
                        <span className="text-xs font-bold tabular-nums text-emerald-700">−{formatXOF(app.amount)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{app.description}</p>
                      {app.freeLine && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-800">
                          <Gift className="h-3 w-3" /> {app.freeLine.productName} × {app.freeLine.quantity} ajouté au panier
                        </p>
                      )}
                      {app.discountedLine && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-800">
                          <Percent className="h-3 w-3" /> {app.discountedLine.productName} proposé à{" "}
                          {formatXOF(app.discountedLine.unitPrice - app.discountedLine.discountPerUnit)} l'unité
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg bg-secondary/60 p-2.5 text-[11px] leading-snug text-muted-foreground">
                  Aucune promotion active ne s'applique : vérifiez les quantités déclencheuses, le périmètre, le montant
                  minimum et les dates de validité.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ---------- Dialog formulaire ---------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[min(46rem,95vw)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Modifier « ${editing.name} »` : "Nouvelle promotion"}</DialogTitle>
            <DialogDescription>
              Les promotions sont appliquées automatiquement par le serveur lors du calcul du panier — aucun code à saisir pour le client.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <FieldLabel required>Nom</FieldLabel>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="2 accessoires audio achetés = coque Protect+ offerte"
                className="h-9"
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel>Description</FieldLabel>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Conditions expliquées au client sur la fiche produit et au panier."
                rows={2}
                maxLength={1000}
              />
            </div>

            {/* Type de règle */}
            <div className="space-y-1.5">
              <FieldLabel required>Type de règle</FieldLabel>
              <div className="grid gap-2 md:grid-cols-3">
                {RULE_CARDS.map((r) => {
                  const Icon = r.icon
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, ruleType: r.value }))}
                      className={cn(
                        "rounded-xl border p-3 text-left transition",
                        form.ruleType === r.value
                          ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                          : "hover:border-amber-200 hover:bg-secondary/60",
                      )}
                    >
                      <Icon className="mb-1.5 h-4 w-4 text-amber-600" strokeWidth={1.8} />
                      <p className="text-sm font-semibold leading-tight">{r.title}</p>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{r.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Quantités */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel required>Quantité à acheter (X)</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={form.requiredQty}
                  onChange={(e) => setForm((f) => ({ ...f, requiredQty: Math.max(1, Number(e.target.value)) }))}
                  className="h-9"
                />
                <FieldHint text="Nombre d'unités éligibles à acheter pour déclencher l'offre." />
              </div>
              <div className="space-y-1.5">
                <FieldLabel required>
                  {form.ruleType === "BUY_X_GET_Y_SAME" ? "Unités offertes (Y)" : "Quantité offerte / réduite"}
                </FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={form.rewardQty}
                  onChange={(e) => setForm((f) => ({ ...f, rewardQty: Math.max(1, Number(e.target.value)) }))}
                  className="h-9"
                />
                <FieldHint
                  text={
                    form.ruleType === "BUY_X_GET_Y_SAME"
                      ? "Les unités les moins chères de la sélection sont offertes."
                      : "Nombre d'exemplaires du produit désigné."
                  }
                />
              </div>
            </div>

            {/* Produit récompense / réduction */}
            {form.ruleType !== "BUY_X_GET_Y_SAME" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel required>{form.ruleType === "BUY_X_GET_PRODUCT_FREE" ? "Produit offert" : "Produit proposé"}</FieldLabel>
                  {listsLoaded ? (
                    <ProductSingleSelect
                      products={products}
                      value={form.rewardProductId}
                      onChange={(id) => setForm((f) => ({ ...f, rewardProductId: id }))}
                    />
                  ) : (
                    <Skeleton className="h-9 w-full" />
                  )}
                </div>
                {form.ruleType === "BUY_X_GET_PRODUCT_DISCOUNT" && (
                  <div className="space-y-1.5">
                    <FieldLabel required>Réduction sur ce produit (%)</FieldLabel>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={form.discountPercent ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, discountPercent: e.target.value === "" ? null : Number(e.target.value) }))
                      }
                      className="h-9"
                    />
                    <FieldHint text="Le client verra le produit réduit dans son panier dès X articles déclencheurs." />
                  </div>
                )}
              </div>
            )}

            {/* Périmètre */}
            <div className="space-y-1.5">
              <FieldLabel>Sélection éligible (déclencheurs)</FieldLabel>
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
              {form.appliesTo === "PRODUCTS" &&
                (listsLoaded ? (
                  <ProductMultiPicker
                    products={products}
                    selected={form.productIds}
                    onChange={(ids) => setForm((f) => ({ ...f, productIds: ids }))}
                  />
                ) : (
                  <Skeleton className="h-9 w-full" />
                ))}
              {form.appliesTo === "CATEGORIES" &&
                (listsLoaded ? (
                  <CategoryMultiPicker
                    categories={categories}
                    selected={form.categoryIds}
                    onChange={(ids) => setForm((f) => ({ ...f, categoryIds: ids }))}
                  />
                ) : (
                  <Skeleton className="h-9 w-full" />
                ))}
              <FieldHint text="Seuls ces articles comptent dans la quantité déclencheuse X." />
            </div>

            {/* Conditions */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <FieldLabel>Montant minimum (FCFA)</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  value={form.minOrderAmount}
                  onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: Number(e.target.value) }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Utilisations max (global)</FieldLabel>
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
                <FieldHint text="0 = illimité" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <FieldLabel>Priorité</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                  className="h-9"
                />
                <FieldHint text="Les priorités hautes s'appliquent en premier." />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Badge vitrine</FieldLabel>
                <Input
                  value={form.badgeLabel}
                  onChange={(e) => setForm((f) => ({ ...f, badgeLabel: e.target.value }))}
                  placeholder="1 coque offerte"
                  className="h-9"
                  maxLength={60}
                />
                <FieldHint text="Étiquette courte affichée sur les fiches produits." />
              </div>
              <div className="flex items-end space-x-2 pb-1">
                <Switch
                  id="promo-combinable"
                  checked={form.combinable}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, combinable: v }))}
                />
                <label htmlFor="promo-combinable" className="cursor-pointer text-sm">
                  Cumulable avec d'autres
                </label>
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

            <div className="flex items-center space-x-2">
              <Switch
                id="promo-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
              <label htmlFor="promo-active" className="cursor-pointer text-sm">
                Promotion active
              </label>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={busy || !listsLoaded}>
              {editing ? "Enregistrer" : "Créer la promotion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
