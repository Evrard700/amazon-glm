"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import {
  BadgeCheck,
  Check,
  EyeOff,
  MessageSquareReply,
  Package,
  RotateCcw,
  Star,
  Trash2,
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
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { AdminPageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { useAdminApi } from "@/components/admin/api-client"
import { cn } from "@/lib/utils"
import {
  formatDateFR,
  MarketingEmptyState,
  StarsRating,
  TableActionButton,
  ToneBadge,
} from "@/components/admin/marketing/helpers"

interface AdminReview {
  id: string
  product: { id: string; name: string; slug: string; image: string | null; ratingAvg: number; ratingCount: number }
  author: { name: string; email: string | null }
  rating: number
  title: string | null
  comment: string
  isVerifiedBuyer: boolean
  status: "PENDING" | "APPROVED" | "REJECTED"
  adminReply: string | null
  createdAt: string
  updatedAt: string
}

type TabStatus = "PENDING" | "APPROVED" | "REJECTED"

const STATUS_TAB_LABELS: Record<TabStatus, string> = {
  PENDING: "À modérer",
  APPROVED: "Approuvés",
  REJECTED: "Rejetés",
}

export default function ReviewsPage() {
  const api = useAdminApi()
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [counts, setCounts] = useState({ PENDING: 0, APPROVED: 0, REJECTED: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabStatus>("PENDING")

  const [detail, setDetail] = useState<AdminReview | null>(null)
  const [replyText, setReplyText] = useState("")
  const [rejectTarget, setRejectTarget] = useState<AdminReview | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (status: TabStatus = "PENDING") => {
      const data = await api.get<{ counts: typeof counts; reviews: AdminReview[] }>(
        `/api/admin/marketing/reviews?status=${status}`,
      )
      if (data) {
        setReviews(data.reviews)
        setCounts(data.counts)
      }
      setLoading(false)
    },
    [api],
  )

  useEffect(() => {
    const t = setTimeout(() => void load(tab), 0)
    return () => clearTimeout(t)
  }, [load, tab])

  const approve = async (r: AdminReview) => {
    setBusy(true)
    const data = await api.post<{ ratingAvg: number; ratingCount: number }>(
      `/api/admin/marketing/reviews/${r.id}/approve`,
      {},
    )
    if (data) {
      toast.success(
        `Avis publié — note moyenne de « ${r.product.name} » recalculée : ${data.ratingAvg}/5 (${data.ratingCount} avis).`,
      )
      void load(tab)
      setDetail(null)
    }
    setBusy(false)
  }

  const reject = async () => {
    if (!rejectTarget) return
    setBusy(true)
    const data = await api.post<{ status: string; withdrew: boolean }>(
      `/api/admin/marketing/reviews/${rejectTarget.id}/reject`,
      { reason: rejectReason.trim() || undefined },
    )
    if (data) {
      if (data.withdrew) {
        toast.success("Avis retiré de la fiche produit et remis en modération — note moyenne recalculée.")
      } else {
        toast.success("Avis rejeté — il ne sera jamais publié.")
      }
      setRejectTarget(null)
      setRejectReason("")
      setDetail(null)
      void load(tab)
    }
    setBusy(false)
  }

  const saveReply = async () => {
    if (!detail) return
    if (replyText.trim().length < 2) {
      toast.error("La réponse doit contenir au moins 2 caractères.")
      return
    }
    setBusy(true)
    const data = await api.patch(`/api/admin/marketing/reviews/${detail.id}`, {
      adminReply: replyText.trim(),
    })
    if (data) {
      toast.success("Réponse enregistrée — elle sera visible sur la fiche produit.")
      setDetail(null)
      setReplyText("")
      void load(tab)
    }
    setBusy(false)
  }

  const openDetail = (r: AdminReview) => {
    setDetail(r)
    setReplyText(r.adminReply ?? "")
  }

  const openReject = (r: AdminReview) => {
    setRejectTarget(r)
    setRejectReason("")
  }

  const columns = useMemo<ColumnDef<AdminReview, unknown>[]>(
    () => [
      {
        id: "product",
        header: "Produit",
        cell: ({ row }) => {
          const p = row.original.product
          return (
            <div className="flex min-w-52 items-center gap-2">
              {p.image ? (
                 
                <img src={p.image} alt={p.name} className="h-10 w-10 rounded-md object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {p.ratingAvg > 0 ? `${p.ratingAvg}/5 · ${p.ratingCount} avis` : "pas encore de note"}
                </p>
              </div>
            </div>
          )
        },
      },
      {
        id: "author",
        header: "Auteur",
        cell: ({ row }) => (
          <div className="min-w-36">
            <p className="text-sm font-medium leading-tight">{row.original.author.name}</p>
            {row.original.isVerifiedBuyer && (
              <ToneBadge tone="ok" className="mt-0.5">
                <BadgeCheck className="mr-1 h-3 w-3" /> Achat vérifié
              </ToneBadge>
            )}
          </div>
        ),
      },
      {
        accessorKey: "rating",
        header: "Note",
        cell: ({ row }) => <StarsRating rating={row.original.rating} />,
      },
      {
        id: "content",
        header: "Avis",
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="max-w-96 space-y-0.5">
              {r.title && <p className="text-sm font-semibold leading-tight">{r.title}</p>}
              <p className="truncate text-xs text-muted-foreground" title={r.comment}>
                {r.comment}
              </p>
              {r.adminReply && (
                <p className="truncate text-[11px] font-medium text-amber-700" title={r.adminReply}>
                  <MessageSquareReply className="mr-0.5 inline h-3 w-3" />
                  Réponse admin : {r.adminReply}
                </p>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: "createdAt",
        header: "Date",
        cell: ({ row }) => <span className="text-xs">{formatDateFR(row.original.createdAt)}</span>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <TableActionButton label="Détail / Répondre" onClick={() => openDetail(r)} />
              {r.status === "PENDING" && (
                <>
                  <TableActionButton label="Approuver" tone="ok" onClick={() => approve(r)} />
                  <TableActionButton label="Rejeter" tone="danger" onClick={() => openReject(r)} />
                </>
              )}
              {r.status === "APPROVED" && (
                <TableActionButton
                  label="Retirer"
                  tone="danger"
                  title="Retire l'avis public et le remet en modération"
                  onClick={() => openReject(r)}
                />
              )}
              {r.status === "REJECTED" && (
                <TableActionButton label="Réhabiliter" tone="ok" onClick={() => approve(r)} />
              )}
            </div>
          )
        },
      },
    ],
     
    [tab, approve],
  )

  const emptyMessages: Record<TabStatus, { title: string; description: string }> = {
    PENDING: {
      title: "Aucun avis en attente",
      description: "Tous les avis sont traités — les nouveaux avis clients apparaîtront ici pour modération.",
    },
    APPROVED: {
      title: "Aucun avis publié",
      description: "Approuvez des avis en modération pour les afficher sur les fiches produits.",
    },
    REJECTED: {
      title: "Aucun avis rejeté",
      description: "Les avis refusés restent archivés ici : ils ne seront jamais visibles côté client.",
    },
  }

  return (
    <div>
      <AdminPageHeader
        title="Modération des avis"
        description="Publiez, rejetez ou répondez aux avis clients — chaque approbation recalcule automatiquement la note moyenne du produit."
      />

      <Tabs id="reviews-status" value={tab} onValueChange={(v) => setTab(v as TabStatus)}>
        <TabsList>
          {(["PENDING", "APPROVED", "REJECTED"] as TabStatus[]).map((s) => (
            <TabsTrigger key={s} value={s}>
              {STATUS_TAB_LABELS[s]}
              {s === "PENDING" && counts.PENDING > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                  {counts.PENDING}
                </span>
              )}
              {s !== "PENDING" && (
                <span className="ml-1 text-xs text-muted-foreground">({counts[s]})</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {(["PENDING", "APPROVED", "REJECTED"] as TabStatus[]).map((s) => (
          <TabsContent key={s} value={s} className="mt-4">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <>
                {s === "PENDING" && (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Seuls les avis approuvés deviennent publics. « Achat vérifié » atteste d'une commande payée contenant
                    le produit — l'approbation recalcule la moyenne en direct.
                  </p>
                )}
                {reviews.length === 0 ? (
                  <MarketingEmptyState
                    icon={Star}
                    title={emptyMessages[s].title}
                    description={emptyMessages[s].description}
                  />
                ) : (
                  <DataTable
                    columns={columns}
                    data={reviews}
                    searchPlaceholder="Rechercher un produit, un auteur…"
                    emptyMessage="Aucun avis."
                    pageSize={10}
                  />
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* ---------- Dialog détail + réponse admin ---------- */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="w-[min(38rem,95vw)]">
          <DialogHeader>
            <DialogTitle>Avis sur « {detail?.product.name} »</DialogTitle>
            <DialogDescription>
              Par {detail?.author.name} · {detail ? formatDateFR(detail.createdAt) : ""}{" "}
              {detail?.isVerifiedBuyer ? "· achat vérifié" : ""}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-secondary/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <StarsRating rating={detail.rating} />
                  {detail.isVerifiedBuyer && (
                    <ToneBadge tone="ok">
                      <BadgeCheck className="mr-1 h-3 w-3" /> Achat vérifié
                    </ToneBadge>
                  )}
                </div>
                {detail.title && <p className="mt-1.5 text-sm font-bold">{detail.title}</p>}
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{detail.comment}</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="admin-reply" className="text-sm font-medium">
                  Réponse de l'administration
                </label>
                <Textarea
                  id="admin-reply"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Merci pour votre retour ! Notre équipe…"
                />
                <p className="text-xs text-muted-foreground">
                  Visible ensuite sur la fiche produit, sous l'avis. Effacez le champ et enregistrez pour retirer la réponse.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {detail?.status === "PENDING" && (
                <>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => approve(detail)}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Approuver
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => detail && openReject(detail)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Rejeter
                  </Button>
                </>
              )}
              {detail?.status === "APPROVED" && (
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => detail && openReject(detail)}>
                  <EyeOff className="mr-1 h-3.5 w-3.5" /> Retirer et remettre en modération
                </Button>
              )}
              {detail?.status === "REJECTED" && (
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => approve(detail)}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Réhabiliter (publier)
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDetail(null)} disabled={busy}>
                Fermer
              </Button>
              <Button onClick={saveReply} disabled={busy}>
                Enregistrer la réponse
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog rejet (raison optionnelle) ---------- */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {rejectTarget?.status === "APPROVED" ? "Retirer cet avis publié ?" : "Rejeter cet avis ?"}
            </DialogTitle>
            <DialogDescription>
              {rejectTarget?.status === "APPROVED"
                ? "L'avis quittera immédiatement la fiche produit (note moyenne recalculée) et retournera en file de modération."
                : "L'avis ne sera pas publié. Vous pourrez toujours le réhabiliter plus tard depuis l'onglet « Rejetés »."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="reject-reason" className="text-sm font-medium">
              Raison (optionnelle, journalisée)
            </label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ex. : langage inapproprié, avis hors-sujet, suspicion de faux avis…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={busy}>
              Retour
            </Button>
            <Button variant="destructive" onClick={reject} disabled={busy}>
              {rejectTarget?.status === "APPROVED" ? (
                <>
                  <EyeOff className="mr-1.5 h-4 w-4" /> Retirer l'avis
                </>
              ) : (
                <>
                  <Trash2 className="mr-1.5 h-4 w-4" /> Rejeter l'avis
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
