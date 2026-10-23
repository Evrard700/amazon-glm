"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Gift,
  Loader2,
  MailCheck,
  MailX,
  Plus,
  Star,
  StickyNote,
  Tag,
  UserRound,
  Wallet,
} from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { useAdminApi } from "@/components/admin/api-client"
import { useMe } from "@/components/admin/shared/use-me"
import { OrderStatusBadge, PaymentStatusBadge, RewardStatusBadge, RoleBadge } from "@/components/admin/shared/badges"
import { ChipsInput } from "@/components/admin/shared/chips-input"
import { formatDate, formatDateTime } from "@/components/admin/shared/format"
import { formatXOF } from "@/lib/money"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface CustomerDetail {
  customer: {
    id: string
    name: string
    email: string
    phone: string | null
    city: string | null
    address: string | null
    storeCredit: number
    tags: string[]
    marketingConsent: boolean
    isActive: boolean
    referralCode: string
    referredBy: { id: string; name: string; email: string; referralCode: string } | null
    referrals: { id: string; name: string; email: string; createdAt: string }[]
    createdAt: string
    lastLoginAt: string | null
  }
  orders: { id: string; orderNumber: string; total: number; amountPaid: number; orderStatus: string; paymentStatus: string; createdAt: string }[]
  creditTransactions: { id: string; amount: number; type: string; description: string; balanceAfter: number; createdAt: string }[]
  rewards: { id: string; program: string; amount: number; status: string; reason: string; sourceOrder: { id: string; orderNumber: string }; createdAt: string }[]
  reviews: { id: string; rating: number; title: string | null; comment: string; status: string; createdAt: string; product: { id: string; name: string } }[]
  notes: { id: string; content: string; createdAt: string; author: { id: string; name: string; role: string } }[]
}

export default function AdminCustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const api = useAdminApi()
  const { me } = useMe()
  const canManage = me ? me.permissions.includes("customers.manage") : true

  const [data, setData] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [creditOpen, setCreditOpen] = useState(false)
  const [creditAmount, setCreditAmount] = useState("")
  const [creditReason, setCreditReason] = useState("")
  const [tagsOpen, setTagsOpen] = useState(false)
  const [tagsDraft, setTagsDraft] = useState<string[]>([])
  const [newNote, setNewNote] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const result = await api.get<CustomerDetail>(`/api/admin/customers/${id}`)
    if (result) setData(result)
    setLoading(false)
     
  }, [api, id])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  async function patch(body: Record<string, unknown>, msg: string, closeFn?: () => void) {
    setBusy(true)
    const result = await api.patch(`/api/admin/customers/${id}`, body)
    setBusy(false)
    if (result !== null) {
      toast.success(msg)
      closeFn?.()
      await load()
    }
  }

  const c = data?.customer

  if (loading || !data || !c) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-24 animate-pulse rounded-xl bg-secondary" />
        <div className="h-72 animate-pulse rounded-xl bg-secondary" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <AdminPageHeader
        title={c.name}
        description={`${c.email}${c.phone ? ` · ${c.phone}` : ""}${c.city ? ` · ${c.city}` : ""}`}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push("/admin/customers")} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Button>
            {canManage && (
              <>
                <Button variant="outline" className="gap-1.5" onClick={() => { setTagsDraft(c.tags); setTagsOpen(true) }}>
                  <Tag className="h-4 w-4" /> Tags CRM
                </Button>
                <Button className="gap-1.5" onClick={() => { setCreditAmount(""); setCreditReason(""); setCreditOpen(true) }}>
                  <Wallet className="h-4 w-4" /> Ajuster le crédit
                </Button>
              </>
            )}
          </>
        }
      />

      {/* En-tête */}
      <Card className="mb-4 rounded-xl border bg-card">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Crédit boutique</p>
            <p className="mt-0.5 text-xl font-extrabold text-emerald-700">{formatXOF(c.storeCredit)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Code parrainage</p>
            <p className="mt-0.5 font-mono text-sm font-semibold">{c.referralCode}</p>
            <p className="text-xs text-muted-foreground">
              {c.referrals.length} filleul(s){c.referredBy ? ` · parrain : ${c.referredBy.name}` : ""}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Consentement marketing</p>
            <p className="mt-0.5">
              {c.marketingConsent ? (
                <Badge variant="outline" className="border border-emerald-200 bg-emerald-50 text-emerald-800">
                  <MailCheck className="mr-1 h-3 w-3" /> Accepté
                </Badge>
              ) : (
                <Badge variant="outline" className="border bg-neutral-100 text-neutral-600 border-neutral-200">
                  <MailX className="mr-1 h-3 w-3" /> Refusé
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">Géré par le client seul (RGPD)</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Compte · Rôle</p>
            <div className="mt-0.5 flex items-center gap-2">
              <Badge variant="outline" className="border bg-stone-100 text-stone-600 border-stone-200">
                <UserRound className="mr-1 h-3 w-3" /> Client
              </Badge>
              {canManage && (
                <div className="flex items-center gap-1.5">
                  <Switch
                    id="customer-active"
                    checked={c.isActive}
                    disabled={busy}
                    onCheckedChange={(v) => patch({ isActive: v }, v ? "Compte réactivé." : "Compte désactivé — le client ne peut plus se connecter.")}
                  />
                  <Label htmlFor="customer-active" className="text-xs">{c.isActive ? "Actif" : "Inactif"}</Label>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Inscrit le {formatDate(c.createdAt)}</p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="orders">
        <TabsList className="flex-wrap">
          <TabsTrigger value="orders">Commandes ({data.orders.length})</TabsTrigger>
          <TabsTrigger value="activity">Activité crédit ({data.creditTransactions.length})</TabsTrigger>
          <TabsTrigger value="rewards">Récompenses ({data.rewards.length})</TabsTrigger>
          <TabsTrigger value="referrals">Parrainage</TabsTrigger>
          <TabsTrigger value="reviews">Avis ({data.reviews.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({data.notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-3">
          <Card className="rounded-xl border bg-card">
            <CardContent className="p-0">
              {data.orders.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Aucune commande.</p>
              ) : (
                <ul className="max-h-96 divide-y overflow-y-auto scrollbar-thin">
                  {data.orders.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <Link href={`/admin/orders/${o.id}`} className="font-mono text-sm font-semibold hover:underline">
                        {o.orderNumber}
                      </Link>
                      <span className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)}</span>
                      <span className="ml-auto font-semibold">{formatXOF(o.total)}</span>
                      <div className="flex gap-1.5">
                        <OrderStatusBadge status={o.orderStatus} />
                        <PaymentStatusBadge status={o.paymentStatus} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-3">
          <Card className="rounded-xl border bg-card">
            <CardContent className="p-0">
              {data.creditTransactions.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Aucun mouvement de crédit.</p>
              ) : (
                <ul className="max-h-96 divide-y overflow-y-auto scrollbar-thin">
                  {data.creditTransactions.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${t.amount >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                        {t.amount >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{t.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.type} · {formatDateTime(t.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold tabular-nums ${t.amount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {t.amount >= 0 ? "+" : ""}{formatXOF(t.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">solde : {formatXOF(t.balanceAfter)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rewards" className="mt-3">
          <Card className="rounded-xl border bg-card">
            <CardContent className="p-0">
              {data.rewards.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Aucune récompense parrainage.</p>
              ) : (
                <ul className="max-h-96 divide-y overflow-y-auto scrollbar-thin">
                  {data.rewards.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <Gift className="h-4 w-4 shrink-0 text-brand" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{r.reason}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.program === "COMMISSION" ? "Commission" : "Remboursement intégral"} · commande{" "}
                          <Link href={`/admin/orders/${r.sourceOrder.id}`} className="font-mono hover:underline">{r.sourceOrder.orderNumber}</Link> · {formatDate(r.createdAt)}
                        </p>
                      </div>
                      <span className="font-semibold tabular-nums">{formatXOF(r.amount)}</span>
                      <RewardStatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrals" className="mt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="rounded-xl border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Parrain</CardTitle>
              </CardHeader>
              <CardContent>
                {c.referredBy ? (
                  <div>
                    <Link href={`/admin/customers/${c.referredBy.id}`} className="text-sm font-semibold hover:underline">
                      {c.referredBy.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{c.referredBy.email} · code {c.referredBy.referralCode}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Ce client n'a pas de parrain.</p>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-xl border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Filleuls ({c.referrals.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {c.referrals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun filleul pour le moment.</p>
                ) : (
                  <ul className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin">
                    {c.referrals.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/admin/customers/${r.id}`} className="truncate font-medium hover:underline">
                          {r.name}
                        </Link>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reviews" className="mt-3">
          <Card className="rounded-xl border bg-card">
            <CardContent className="p-0">
              {data.reviews.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Aucun avis publié par ce client.</p>
              ) : (
                <ul className="max-h-96 divide-y overflow-y-auto scrollbar-thin">
                  {data.reviews.map((r) => (
                    <li key={r.id} className="px-4 py-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span className="flex items-center gap-0.5 text-amber-500">
                          {Array.from({ length: r.rating }).map((_, i) => (
                            <Star key={i} className="h-3.5 w-3.5 fill-current" />
                          ))}
                        </span>
                        <Link href={`/admin/products/${r.product.id}`} className="truncate hover:underline">
                          {r.product.name}
                        </Link>
                        <Badge
                          variant="outline"
                          className={
                            r.status === "APPROVED"
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                              : r.status === "PENDING"
                                ? "border border-amber-200 bg-amber-50 text-amber-800"
                                : "border border-rose-200 bg-rose-50 text-rose-700"
                          }
                        >
                          {r.status === "APPROVED" ? "Publié" : r.status === "PENDING" ? "En modération" : "Rejeté"}
                        </Badge>
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-3">
          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <StickyNote className="h-4 w-4" /> Notes internes
              </CardTitle>
              <p className="text-xs text-muted-foreground">Visibles uniquement par l'équipe, jamais par le client.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {canManage && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Ajouter une note sur ce client…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newNote.trim().length > 0) {
                        patch({ note: newNote.trim() }, "Note ajoutée.").then(() => setNewNote(""))
                      }
                    }}
                  />
                  <Button
                    disabled={busy || newNote.trim().length === 0}
                    onClick={() => patch({ note: newNote.trim() }, "Note ajoutée.").then(() => setNewNote(""))}
                    className="gap-1.5"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Plus className="h-4 w-4" /> Ajouter
                  </Button>
                </div>
              )}
              {data.notes.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Aucune note.</p>
              ) : (
                <ul className="max-h-72 space-y-2 overflow-y-auto scrollbar-thin">
                  {data.notes.map((n) => (
                    <li key={n.id} className="rounded-lg border bg-secondary/40 p-3 text-sm">
                      <p>{n.content}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {n.author.name} · <RoleBadge role={n.author.role} /> · {formatDateTime(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog ajustement crédit */}
      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajuster le crédit boutique</DialogTitle>
            <DialogDescription>
              Solde actuel : {formatXOF(c.storeCredit)}. Montant signé : positif pour créditer, négatif pour débiter.
              L'opération crée une transaction ADMIN_ADJUSTMENT journalisée.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="credit-amount">Montant (FCFA, signé) *</Label>
              <Input id="credit-amount" type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="Ex : 5000 ou -2000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="credit-reason">Motif *</Label>
              <Input id="credit-reason" value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="Ex : geste commercial, correction d'erreur…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditOpen(false)}>Annuler</Button>
            <Button
              disabled={busy || creditReason.trim().length < 3 || creditAmount.trim() === "" || Math.round(Number(creditAmount)) === 0 || c.storeCredit + Math.round(Number(creditAmount)) < 0}
              onClick={() =>
                patch(
                  { creditAdjustment: { amount: Math.round(Number(creditAmount)), reason: creditReason.trim() } },
                  "Crédit ajusté et journalisé.",
                  () => setCreditOpen(false),
                )
              }
            >
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Valider l'ajustement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog tags */}
      <Dialog open={tagsOpen} onOpenChange={setTagsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Étiquettes CRM</DialogTitle>
            <DialogDescription>Segmentation interne : VIP, grossiste, service après-vente…</DialogDescription>
          </DialogHeader>
          <ChipsInput value={tagsDraft} onChange={setTagsDraft} placeholder="Saisir un tag puis Entrée…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagsOpen(false)}>Annuler</Button>
            <Button disabled={busy} onClick={() => patch({ tags: tagsDraft }, "Tags mis à jour.", () => setTagsOpen(false))}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <BadgeCheck className="h-3.5 w-3.5" /> Toutes les modifications CRM sont journalisées dans le journal d'activité.
      </p>
    </div>
  )
}
