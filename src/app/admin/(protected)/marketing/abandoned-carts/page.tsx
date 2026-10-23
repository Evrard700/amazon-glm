"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import {
  ArrowDownRight,
  BadgeCheck,
  Info,
  Mail,
  Package,
  ShoppingCart,
  TicketPercent,
} from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminPageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { StatCard } from "@/components/admin/stat-card"
import { useAdminApi } from "@/components/admin/api-client"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"
import {
  FieldHint,
  FieldLabel,
  formatDateTimeFR,
  MarketingEmptyState,
  TableActionButton,
  timeAgoFR,
  ToneBadge,
} from "@/components/admin/marketing/helpers"

interface CartItemRow {
  itemId: string
  productId: string
  name: string
  slug: string
  variantName: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  image: string | null
}

interface AbandonedCart {
  id: string
  sessionToken: string
  customer: { id: string; name: string; email: string } | null
  isGuest: boolean
  lastActivityAt: string
  createdAt: string
  itemCount: number
  items: CartItemRow[]
  estimatedValue: number
  couponId: string | null
  recoveryCouponSentAt: string | null
  convertedOrder: { id: string; orderNumber: string; total: number } | null
}

interface CartsStats {
  abandonedCount: number
  totalValue: number
  withAccount: number
  guests: number
  converted: number
  recoverySent: number
}

export default function AbandonedCartsPage() {
  const api = useAdminApi()
  const [carts, setCarts] = useState<AbandonedCart[]>([])
  const [stats, setStats] = useState<CartsStats | null>(null)
  const [loading, setLoading] = useState(true)

  const [detail, setDetail] = useState<AbandonedCart | null>(null)
  const [recoveryTarget, setRecoveryTarget] = useState<AbandonedCart | null>(null)
  const [recoveryType, setRecoveryType] = useState<"PERCENT" | "FIXED">("PERCENT")
  const [recoveryValue, setRecoveryValue] = useState(10)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const data = await api.get<{ stats: CartsStats; carts: AbandonedCart[] }>(
      "/api/admin/marketing/abandoned-carts",
    )
    if (data) {
      setCarts(data.carts)
      setStats(data.stats)
    }
    setLoading(false)
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const openRecovery = (cart: AbandonedCart) => {
    setRecoveryTarget(cart)
    setRecoveryType("PERCENT")
    setRecoveryValue(10)
  }

  const submitRecovery = async () => {
    if (!recoveryTarget) return
    if (recoveryType === "PERCENT" && (recoveryValue < 1 || recoveryValue > 100)) {
      toast.error("Le pourcentage doit être compris entre 1 et 100.")
      return
    }
    if (recoveryType === "FIXED" && recoveryValue < 500) {
      toast.error("Un montant fixe pertinent doit être d'au moins 500 FCFA.")
      return
    }
    setBusy(true)
    const data = await api.post<{
      coupon: { code: string; expiresAt: string }
      customer: { name: string; email: string }
      message: string
    }>(`/api/admin/marketing/abandoned-carts/${recoveryTarget.id}/recovery-coupon`, {
      type: recoveryType,
      value: Math.round(recoveryValue),
      validityDays: 7,
      minOrderAmount: 0,
    })
    if (data) {
      toast.success(
        `Coupon ${data.coupon.code} créé pour ${data.customer.name} (valable jusqu'au ${formatDateTimeFR(data.coupon.expiresAt)}).`,
        { description: data.message, duration: 8000 },
      )
      setRecoveryTarget(null)
      void load()
    }
    setBusy(false)
  }

  const columns = useMemo<ColumnDef<AbandonedCart, unknown>[]>(
    () => [
      {
        accessorKey: "lastActivityAt",
        header: "Dernière activité",
        cell: ({ row }) => (
          <div>
            <ToneBadge tone={Date.now() - new Date(row.original.lastActivityAt).getTime() > 86400000 * 2 ? "danger" : "pending"}>
              {timeAgoFR(row.original.lastActivityAt)}
            </ToneBadge>
            <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTimeFR(row.original.lastActivityAt)}</p>
          </div>
        ),
      },
      {
        id: "customer",
        header: "Client",
        cell: ({ row }) =>
          row.original.customer ? (
            <div className="min-w-44">
              <p className="text-sm font-medium leading-tight">{row.original.customer.name}</p>
              <p className="text-xs text-muted-foreground">{row.original.customer.email}</p>
            </div>
          ) : (
            <ToneBadge tone="neutral">
              <Package className="mr-1 h-3 w-3" /> Invité
            </ToneBadge>
          ),
      },
      {
        id: "items",
        header: "Articles",
        cell: ({ row }) => {
          const cart = row.original
          return (
            <div className="flex max-w-72 items-center gap-2">
              <div className="flex shrink-0 -space-x-2">
                {cart.items.slice(0, 3).map((i) =>
                  i.image ? (
                     
                    <img
                      key={i.itemId}
                      src={i.image}
                      alt={i.name}
                      title={i.name}
                      className="h-8 w-8 rounded-full border-2 border-card object-cover"
                    />
                  ) : (
                    <div key={i.itemId} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-secondary">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  ),
                )}
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {cart.itemCount} article{cart.itemCount > 1 ? "s" : ""} —{" "}
                {cart.items
                  .slice(0, 2)
                  .map((i) => `${i.quantity} × ${i.name}`)
                  .join(", ")}
                {cart.items.length > 2 ? "…" : ""}
              </span>
            </div>
          )
        },
      },
      {
        accessorKey: "estimatedValue",
        header: "Valeur estimée",
        cell: ({ row }) => (
          <span className="text-sm font-semibold tabular-nums">{formatXOF(row.original.estimatedValue)}</span>
        ),
      },
      {
        id: "converted",
        header: "Converti ?",
        cell: ({ row }) =>
          row.original.convertedOrder ? (
            <ToneBadge tone="ok">
              <BadgeCheck className="mr-1 h-3 w-3" /> {row.original.convertedOrder.orderNumber}
            </ToneBadge>
          ) : (
            <span className="text-xs text-muted-foreground">Pas de commande</span>
          ),
      },
      {
        id: "recovery",
        header: "Coupon récup.",
        cell: ({ row }) =>
          row.original.recoveryCouponSentAt ? (
            <ToneBadge tone="brand">créé le {formatDateTimeFR(row.original.recoveryCouponSentAt)}</ToneBadge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const cart = row.original
          return (
            <div className="flex items-center justify-end gap-1.5">
              <TableActionButton label="Détail" onClick={() => setDetail(cart)} />
              <Button
                size="sm"
                className="h-7 bg-amber-500 px-2.5 text-xs font-semibold text-amber-950 hover:bg-amber-600"
                disabled={cart.isGuest}
                onClick={(e) => {
                  e.stopPropagation()
                  openRecovery(cart)
                }}
                title={cart.isGuest ? "Panier invité : aucun compte client à cibler" : "Créer un coupon de récupération ciblé"}
              >
                <TicketPercent className="mr-1 h-3.5 w-3.5" />
                Coupon de récupération
              </Button>
            </div>
          )
        },
      },
    ],
    [],
  )

  return (
    <div>
      <AdminPageHeader
        title="Paniers abandonnés"
        description="Paniers actifs inactifs depuis plus d'1 heure, avec articles et valeur estimée — base de données de relance, sans aucun envoi automatique."
      />

      <Alert className="mb-6 border-amber-300 bg-amber-50 text-amber-900">
        <Info className="h-4 w-4 !text-amber-600" />
        <AlertTitle>Aucun e-mail n'est envoyé automatiquement</AlertTitle>
        <AlertDescription className="text-amber-900/90">
          La création d'un coupon de récupération est <strong>journalisée et ciblée</strong>, mais l'envoi réel du message
          nécessite un fournisseur configuré (module Campagnes). Une récupération ne compte comme une vente{" "}
          <strong>que si une commande existe</strong> : la colonne « Converti ? » reflète uniquement les paniers
          transformés en commandes.
        </AlertDescription>
      </Alert>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Paniers abandonnés" value={stats?.abandonedCount ?? 0} icon={ShoppingCart} loading={loading} />
        <StatCard label="Valeur estimée" value={stats?.totalValue ?? 0} isCurrency icon={ArrowDownRight} hint="prix de la base, hors livraison" loading={loading} />
        <StatCard
          label="Récupérables"
          value={stats?.withAccount ?? 0}
          icon={Mail}
          hint={`clients identifiés (${stats?.guests ?? 0} invités)`}
          loading={loading}
        />
        <StatCard label="Convertis en commande" value={stats?.converted ?? 0} icon={BadgeCheck} loading={loading} />
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : carts.length === 0 ? (
        <MarketingEmptyState
          icon={ShoppingCart}
          title="Aucun panier abandonné"
          description="Aucun panier actif n'est resté inactif plus d'une heure avec des articles. Les nouveaux paniers oubliés apparaîtront ici automatiquement."
        />
      ) : (
        <DataTable
          columns={columns}
          data={carts}
          searchPlaceholder="Rechercher un client, un article…"
          emptyMessage="Aucun panier abandonné."
          pageSize={10}
        />
      )}

      {/* ---------- Dialog détail ---------- */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="w-[min(36rem,95vw)]">
          <DialogHeader>
            <DialogTitle>Panier de {detail?.customer ? detail.customer.name : "l'invité"}</DialogTitle>
            <DialogDescription>
              Dernière activité {detail ? timeAgoFR(detail.lastActivityAt) : ""} · Valeur estimée{" "}
              {formatXOF(detail?.estimatedValue ?? 0)} (hors livraison)
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {detail.items.map((i) => (
                <div key={i.itemId} className="flex items-center gap-3 rounded-lg border p-2.5">
                  {i.image ? (
                     
                    <img src={i.image} alt={i.name} className="h-12 w-12 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-secondary">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight">{i.name}</p>
                    {i.variantName && <p className="text-xs text-muted-foreground">{i.variantName}</p>}
                    <p className="text-xs text-muted-foreground">
                      {i.quantity} × {formatXOF(i.unitPrice)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatXOF(i.lineTotal)}</span>
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {detail?.convertedOrder
                ? `Converti — commande ${detail.convertedOrder.orderNumber} (${formatXOF(detail.convertedOrder.total)}).`
                : "Aucune commande liée : ce panier n'a généré aucune vente à ce jour."}
            </p>
            <Button variant="outline" onClick={() => setDetail(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog coupon de récupération ---------- */}
      <Dialog open={!!recoveryTarget} onOpenChange={(o) => !o && setRecoveryTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Coupon de récupération</DialogTitle>
            <DialogDescription>
              Crée un code <span className="font-mono">RETOUR-XXXXXX</span> réservé à{" "}
              {recoveryTarget?.customer?.name} — valable 7 jours, 1 seul usage. Le panier sera marqué « coupon créé ».
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <FieldLabel required>Type de remise</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: "PERCENT", label: "Pourcentage", hint: "−X %" },
                    { value: "FIXED", label: "Montant fixe", hint: "−X FCFA" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setRecoveryType(t.value)
                      setRecoveryValue(t.value === "PERCENT" ? 10 : 3000)
                    }}
                    className={cn(
                      "rounded-xl border p-2.5 text-left transition",
                      recoveryType === t.value
                        ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                        : "hover:bg-secondary/60",
                    )}
                  >
                    <p className="text-sm font-semibold leading-tight">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel required>{recoveryType === "PERCENT" ? "Valeur (%)" : "Valeur (FCFA)"}</FieldLabel>
              <Input
                type="number"
                min={1}
                value={recoveryValue}
                onChange={(e) => setRecoveryValue(Number(e.target.value))}
                className="h-9"
              />
              <FieldHint
                text={
                  recoveryType === "FIXED"
                    ? `Ce panier vaut ${formatXOF(recoveryTarget?.estimatedValue ?? 0)} — une remise entre 5 et 15 % est recommandée.`
                    : "Ex. : 10 % — assez fort pour convertir, assez bas pour préserver la marge."
                }
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                Aucun e-mail ne partira automatiquement : le coupon est créé et journalisé, l'envoi réel (email /
                WhatsApp) nécessite un fournisseur configuré — voir module Campagnes.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecoveryTarget(null)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={submitRecovery} disabled={busy} className="bg-amber-500 text-amber-950 hover:bg-amber-600">
              <TicketPercent className="mr-1.5 h-4 w-4" /> Créer le coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
