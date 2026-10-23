"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { BadgeCheck, Ban, HandCoins, Info, RefreshCw } from "lucide-react"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import { DataTable } from "@/components/admin/data-table"
import { useAdminApi } from "@/components/admin/api-client"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"
import {
  formatDateFR,
  formatDateTimeFR,
  RewardStatusBadge,
  TableActionButton,
  ToneBadge,
} from "./helpers"

export interface AdminReward {
  id: string
  program: string
  beneficiary: { id: string; name: string; email: string }
  sourceOrder: { id: string; orderNumber: string; total: number }
  filleul: { id: string; name: string; email: string } | null
  amount: number
  status: string
  rewardMode: string
  reason: string
  eligibleAt: string | null
  approvedAt: string | null
  approvedByName: string | null
  paidAt: string | null
  cancelledAt: string | null
  cancelledReason: string | null
  createdAt: string
}

const MODE_LABELS: Record<string, string> = {
  STORE_CREDIT: "crédit boutique",
  COUPON: "coupon dédié",
  MANUAL: "paiement manuel",
}

/**
 * Table des récompenses parrainage + actions financières (compartimentées
 * par programme : COMMISSION / FULL_REFUND). Toute approbation passe par
 * l'API transactionnelle (crédit boutique / coupon / paiement manuel),
 * toute annulation débite le crédit déjà accordé si nécessaire.
 */
export function RewardsPanel({
  program,
  title = "Récompenses",
}: {
  program: "COMMISSION" | "FULL_REFUND"
  title?: string
}) {
  const api = useAdminApi()
  const [rewards, setRewards] = useState<AdminReward[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  // Dialogs
  const [approveTarget, setApproveTarget] = useState<AdminReward | null>(null)
  const [cancelTarget, setCancelTarget] = useState<AdminReward | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [payTarget, setPayTarget] = useState<AdminReward | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const data = await api.get<{ processedDue: number; rewards: AdminReward[] }>(
      `/api/admin/marketing/rewards?program=${program}`,
    )
    if (data) {
      setRewards(data.rewards)
      if (data.processedDue > 0) {
        toast.info(`${data.processedDue} récompense(s) arrivée(s) à échéance ont été créditées automatiquement.`)
      }
    }
    setLoading(false)
  }, [api, program])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [reloadKey])

  const refresh = () => setReloadKey((k) => k + 1)

  const doApprove = async () => {
    if (!approveTarget) return
    setBusy(true)
    const data = await api.post<{
      status: string
      mode: string
      creditBalanceAfter: number | null
      couponCode: string | null
    }>(`/api/admin/marketing/rewards/${approveTarget.id}/approve`, {})
    if (data) {
      if (data.mode === "STORE_CREDIT") {
        toast.success(
          `Récompense approuvée — ${formatXOF(approveTarget.amount)} crédités au portefeuille (nouveau solde : ${formatXOF(data.creditBalanceAfter ?? 0)}).`,
        )
      } else if (data.mode === "COUPON") {
        toast.success(`Récompense approuvée — coupon dédié ${data.couponCode} créé (1 utilisation).`)
      } else {
        toast.success("Récompense validée — effectuez le paiement hors plateforme puis « Marquer comme payée ».")
      }
      setApproveTarget(null)
      refresh()
    }
    setBusy(false)
  }

  const doCancel = async () => {
    if (!cancelTarget) return
    setBusy(true)
    const data = await api.post<{ debited: number | null; creditBalanceAfter: number | null; couponRevoked: string | null }>(
      `/api/admin/marketing/rewards/${cancelTarget.id}/cancel`,
      { reason: cancelReason.trim() },
    )
    if (data) {
      const parts: string[] = ["Récompense annulée."]
      if (data.debited !== null && data.debited !== undefined) {
        parts.push(`Crédit débité : ${formatXOF(data.debited)} (solde : ${formatXOF(data.creditBalanceAfter ?? 0)}).`)
      }
      if (data.couponRevoked) parts.push(`Coupon ${data.couponRevoked} désactivé.`)
      toast.success(parts.join(" "))
      setCancelTarget(null)
      setCancelReason("")
      refresh()
    }
    setBusy(false)
  }

  const doMarkPaid = async () => {
    if (!payTarget) return
    setBusy(true)
    const data = await api.post(`/api/admin/marketing/rewards/${payTarget.id}/mark-paid`, {})
    if (data) {
      toast.success(`Récompense marquée comme payée (${formatXOF(payTarget.amount)} — paiement manuel journalisé).`)
      setPayTarget(null)
      refresh()
    }
    setBusy(false)
  }

  const columns = useMemo<ColumnDef<AdminReward, unknown>[]>(
    () => [
      {
        accessorKey: "beneficiary.name",
        header: "Bénéficiaire",
        cell: ({ row }) => (
          <div className="min-w-36">
            <p className="font-medium leading-tight">{row.original.beneficiary.name}</p>
            <p className="text-xs text-muted-foreground">{row.original.beneficiary.email}</p>
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: "Montant",
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">{formatXOF(row.original.amount)}</span>
        ),
      },
      {
        accessorKey: "sourceOrder.orderNumber",
        header: "Commande source",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.sourceOrder.orderNumber}</span>
        ),
      },
      ...(program === "COMMISSION"
        ? [
            {
              id: "filleul",
              header: "Filleul",
              cell: ({ row }) => (
                <div className="min-w-32">
                  {row.original.filleul ? (
                    <>
                      <p className="text-sm leading-tight">{row.original.filleul.name}</p>
                      <p className="text-xs text-muted-foreground">{row.original.filleul.email}</p>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              ),
            } satisfies ColumnDef<AdminReward, unknown>,
          ]
        : []),
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => (
          <div className="space-y-1">
            <RewardStatusBadge status={row.original.status} />
            {row.original.status === "REWARD_PENDING" && row.original.eligibleAt && (
              <p className="text-[11px] text-muted-foreground">
                éligible le {formatDateFR(row.original.eligibleAt)}
              </p>
            )}
            {row.original.status === "REWARD_CANCELLED" && row.original.cancelledReason && (
              <p className="max-w-52 truncate text-[11px] text-rose-600" title={row.original.cancelledReason}>
                {row.original.cancelledReason}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "reason",
        header: "Motif",
        cell: ({ row }) => (
          <p className="max-w-72 truncate text-xs text-muted-foreground" title={row.original.reason}>
            {row.original.reason}
          </p>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex flex-wrap gap-1.5">
              {r.status === "REWARD_PENDING" && (
                <>
                  <TableActionButton label="Approuver" tone="ok" onClick={() => setApproveTarget(r)} />
                  <TableActionButton label="Annuler" tone="danger" onClick={() => setCancelTarget(r)} />
                </>
              )}
              {r.status === "REWARD_APPROVED" && (
                <>
                  {r.rewardMode === "MANUAL" && (
                    <TableActionButton label="Marquer payée" tone="ok" onClick={() => setPayTarget(r)} />
                  )}
                  <TableActionButton label="Annuler" tone="danger" onClick={() => setCancelTarget(r)} />
                </>
              )}
              {r.status === "REWARD_AVAILABLE" && (
                <TableActionButton
                  label="Annuler"
                  tone="danger"
                  onClick={() => setCancelTarget(r)}
                  title={r.rewardMode === "STORE_CREDIT" ? "Le crédit déjà accordé sera débité" : undefined}
                />
              )}
              {r.status === "REWARD_PAID" && (
                <ToneBadge tone="neutral">
                  payée le {formatDateFR(r.paidAt)}
                </ToneBadge>
              )}
              {r.status === "REWARD_USED" && (
                <ToneBadge tone="neutral">utilisée</ToneBadge>
              )}
            </div>
          )
        },
      },
    ],
    [program],
  )

  const pendingCount = rewards.filter((r) => r.status === "REWARD_PENDING").length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {pendingCount > 0 && <ToneBadge tone="pending">{pendingCount} en attente</ToneBadge>}
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={refresh}>
          <RefreshCw className="mr-1 h-3 w-3" /> Rafraîchir
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={rewards}
        loading={loading}
        searchPlaceholder="Rechercher un bénéficiaire, un montant…"
        emptyMessage="Aucune récompense pour ce programme."
        pageSize={10}
      />

      {/* ---------- Dialog : approbation anticipée ---------- */}
      <AlertDialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approuver la récompense maintenant ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {approveTarget?.beneficiary.name} recevra <strong>{formatXOF(approveTarget?.amount ?? 0)}</strong>{" "}
                  via le mode <strong>{MODE_LABELS[approveTarget?.rewardMode ?? "STORE_CREDIT"]}</strong>, sans attendre
                  le {formatDateFR(approveTarget?.eligibleAt)}.
                </p>
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>
                    {approveTarget?.rewardMode === "STORE_CREDIT"
                      ? "Le portefeuille crédit boutique sera crédité dans une transaction journalisée (CreditTransaction)."
                      : approveTarget?.rewardMode === "COUPON"
                        ? "Un coupon d'un seul usage, réservé à ce client, sera généré."
                        : "La récompense passera en « Validée » : effectuez ensuite le paiement hors plateforme puis « Marquer comme payée »."}
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction onClick={doApprove} disabled={busy}>
              <BadgeCheck className="mr-1 h-4 w-4" /> Approuver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- Dialog : annulation avec raison ---------- */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Annuler la récompense</DialogTitle>
            <DialogDescription>
              {cancelTarget?.status === "REWARD_AVAILABLE" && cancelTarget?.rewardMode === "STORE_CREDIT"
                ? `Cette récompense est déjà créditée au portefeuille : les ${formatXOF(cancelTarget?.amount ?? 0)} seront automatiquement débités (plancher 0 FCFA) avec une note dans l'historique de crédit.`
                : "La récompense sera marquée annulée et ne pourra plus être créditée."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="cancel-reason" className="text-sm font-medium">
              Raison de l'annulation <span className="text-rose-600">*</span>
            </label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex. : commande remboursée, suspicion de fraude, erreur de paramétrage…"
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">La raison est journalisée dans le journal d'activité.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={busy}>
              Retour
            </Button>
            <Button
              variant="destructive"
              onClick={doCancel}
              disabled={busy || cancelReason.trim().length < 3}
            >
              <Ban className="mr-1 h-4 w-4" /> Annuler la récompense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog : marquer payée (mode manuel) ---------- */}
      <AlertDialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le paiement manuel ?</AlertDialogTitle>
            <AlertDialogDescription>
              <span>
                Confirmez que {formatXOF(payTarget?.amount ?? 0)} ont bien été versés à{" "}
                <strong>{payTarget?.beneficiary.name}</strong> hors plateforme (espèces, mobile money, virement…).
                L'opération sera journalisée avec votre nom, aucune écriture de portefeuille ne sera effectuée.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction onClick={doMarkPaid} disabled={busy} className={cn("bg-emerald-600 hover:bg-emerald-700")}>
              <HandCoins className="mr-1 h-4 w-4" /> Oui, paiement effectué
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
