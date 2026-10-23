"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import {
  CalendarClock,
  Eye,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  Users,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { AdminPageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { useAdminApi } from "@/components/admin/api-client"
import { cn } from "@/lib/utils"
import {
  FieldHint,
  FieldLabel,
  formatDateFR,
  formatDateTimeFR,
  MarketingEmptyState,
  TableActionButton,
  ToneBadge,
  toLocalInputValue,
} from "@/components/admin/marketing/helpers"

type Segment = "TOUS_CLIENTS" | "CLIENTS_AVEC_COMMANDES" | "ABONNES_NEWSLETTER" | "AVEC_CREDIT"

const SEGMENT_LABELS: Record<Segment, string> = {
  TOUS_CLIENTS: "Tous les clients",
  CLIENTS_AVEC_COMMANDES: "Clients avec commandes payées",
  ABONNES_NEWSLETTER: "Abonnés newsletter",
  AVEC_CREDIT: "Clients avec crédit boutique",
}

interface AdminCampaign {
  id: string
  name: string
  channel: "EMAIL" | "WHATSAPP"
  subject: string
  content: string
  segmentKey: Segment
  minOrders: number | null
  recipientCount: number
  status: "DRAFT" | "SCHEDULED"
  scheduledAt: string | null
  note: string | null
  createdAt: string
}

const emptyForm = {
  name: "",
  channel: "EMAIL" as "EMAIL" | "WHATSAPP",
  subject: "",
  content: "Bonjour {{prenom}}, ",
  segment: "TOUS_CLIENTS" as Segment,
  minOrders: 1,
  scheduledAt: "",
  note: "",
}

export default function CampaignsPage() {
  const api = useAdminApi()
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminCampaign | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [audienceLoading, setAudienceLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Comptage d'audience en direct (debounce 350 ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!dialogOpen) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setAudienceLoading(true)
      const min = form.segment === "CLIENTS_AVEC_COMMANDES" ? Math.max(1, form.minOrders) : 1
      const data = await api.get<{ count: number }>(
        `/api/admin/marketing/campaigns/audience-count?segment=${form.segment}&minOrders=${min}`,
      )
      if (data) setAudienceCount(data.count)
      setAudienceLoading(false)
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
     
  }, [form.segment, form.minOrders, dialogOpen])

  const load = useCallback(async () => {
    const data = await api.get<{ campaigns: AdminCampaign[] }>("/api/admin/marketing/campaigns")
    if (data) setCampaigns(data.campaigns)
    setLoading(false)
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setDialogOpen(true)
  }

  const openEdit = (c: AdminCampaign) => {
    setEditing(c)
    setForm({
      name: c.name,
      channel: c.channel,
      subject: c.subject,
      content: c.content,
      segment: c.segmentKey,
      minOrders: c.minOrders ?? 1,
      scheduledAt: c.scheduledAt ? toLocalInputValue(c.scheduledAt) : "",
      note: c.note ?? "",
    })
    setDialogOpen(true)
  }

  const validate = (): string | null => {
    if (form.name.trim().length < 3) return "Le nom doit contenir au moins 3 caractères."
    if (form.subject.trim().length < 3) return "L'objet doit contenir au moins 3 caractères."
    if (form.content.trim().length < 10) return "Le contenu doit contenir au moins 10 caractères."
    return null
  }

  const submit = async () => {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }
    setBusy(true)
    const payload = {
      name: form.name.trim(),
      channel: form.channel,
      subject: form.subject.trim(),
      content: form.content.trim(),
      segment: form.segment,
      minOrders: form.segment === "CLIENTS_AVEC_COMMANDES" ? Math.max(1, form.minOrders) : null,
      scheduledAt: form.scheduledAt || null,
      note: form.note.trim() || null,
    }
    const data = editing
      ? await api.patch(`/api/admin/marketing/campaigns/${editing.id}`, payload)
      : await api.post("/api/admin/marketing/campaigns", payload)
    if (data) {
      toast.success(
        form.scheduledAt
          ? "Campagne programmée — rappel : l'envoi restera inactif tant qu'aucun fournisseur n'est configuré."
          : "Campagne enregistrée en brouillon.",
      )
      setDialogOpen(false)
      void load()
    }
    setBusy(false)
  }

  const doDelete = async (c: AdminCampaign) => {
    const data = await api.del(`/api/admin/marketing/campaigns/${c.id}`)
    if (data) {
      toast.success(`Campagne « ${c.name} » supprimée.`)
      void load()
    }
  }

  const previewContent = form.content.replaceAll("{{prenom}}", "Awa")

  const columns: ColumnDef<AdminCampaign, unknown>[] = [
      {
        accessorKey: "name",
        header: "Campagne",
        cell: ({ row }) => (
          <div className="min-w-52">
            <p className="font-medium leading-tight">{row.original.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={row.original.subject}>
              {row.original.subject}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "channel",
        header: "Canal",
        cell: ({ row }) =>
          row.original.channel === "EMAIL" ? (
            <ToneBadge tone="brand">
              <Mail className="mr-1 h-3 w-3" /> E-mail
            </ToneBadge>
          ) : (
            <ToneBadge tone="ok">
              <MessageCircle className="mr-1 h-3 w-3" /> WhatsApp
            </ToneBadge>
          ),
      },
      {
        id: "audience",
        header: "Audience",
        cell: ({ row }) => (
          <div className="min-w-44">
            <ToneBadge tone="neutral">
              <Users className="mr-1 h-3 w-3" /> {SEGMENT_LABELS[row.original.segmentKey]}
            </ToneBadge>
            <p className="mt-1 text-[11px] text-muted-foreground">
              ≈ {row.original.recipientCount} destinataire{row.original.recipientCount > 1 ? "s" : ""}
              {row.original.segmentKey === "CLIENTS_AVEC_COMMANDES" && row.original.minOrders
                ? ` (≥ ${row.original.minOrders} commande${row.original.minOrders > 1 ? "s" : ""})`
                : ""}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) =>
          row.original.status === "SCHEDULED" ? (
            <div>
              <ToneBadge tone="pending">
                <CalendarClock className="mr-1 h-3 w-3" /> Programmée
              </ToneBadge>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatDateTimeFR(row.original.scheduledAt)} — envoi non actif, fournisseur requis
              </p>
            </div>
          ) : (
            <ToneBadge tone="neutral">Brouillon</ToneBadge>
          ),
      },
      {
        accessorKey: "createdAt",
        header: "Créée le",
        cell: ({ row }) => <span className="text-xs">{formatDateFR(row.original.createdAt)}</span>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <TableActionButton label="Modifier" tone="brand" onClick={() => openEdit(row.original)} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => openEdit(row.original)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Modifier
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-rose-600 focus:text-rose-700" onClick={() => doDelete(row.original)}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ]

  return (
    <div>
      <AdminPageHeader
        title="Campagnes"
        description="E-mail et WhatsApp : préparation des messages et comptage d'audience — sans fournisseur d'envoi configuré, rien ne part."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Nouvelle campagne
          </Button>
        }
      />

      <Alert className="mb-6 border-amber-300 bg-amber-50 text-amber-900">
        <TriangleAlert className="h-4 w-4 !text-amber-600" />
        <AlertTitle>Aucun fournisseur d'envoi n'est configuré</AlertTitle>
        <AlertDescription className="text-amber-900/90">
          Les campagnes restent en brouillon — <strong>aucun message n'est envoyé</strong>, aucune simulation
          d'envoi n'est exécutée. Connectez un fournisseur réel (e-mail transactionnel, API WhatsApp Business) pour
          activer l'envoi.
        </AlertDescription>
      </Alert>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : campaigns.length === 0 ? (
        <MarketingEmptyState
          icon={Send}
          title="Aucune campagne"
          description="Préparez vos messages de relance et bienvenue : objet, contenu avec variables {{prenom}}, audience calculée en direct."
          action={
            <Button onClick={openCreate} size="sm">
              <Plus className="mr-1.5 h-4 w-4" /> Créer une campagne
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={campaigns}
          searchPlaceholder="Rechercher une campagne…"
          emptyMessage="Aucune campagne ne correspond."
          pageSize={10}
        />
      )}

      {/* ---------- Dialog formulaire ---------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[min(42rem,95vw)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Modifier « ${editing.name} »` : "Nouvelle campagne"}</DialogTitle>
            <DialogDescription>
              Aucun message ne sera envoyé : la campagne est enregistrée en brouillon (ou programmée, sans envoi actif) jusqu'à la connexion d'un fournisseur.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel required>Nom interne</FieldLabel>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Relance paniers high-tech"
                  className="h-9"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel required>Canal</FieldLabel>
                <Select
                  value={form.channel}
                  onValueChange={(v) => setForm((f) => ({ ...f, channel: v as "EMAIL" | "WHATSAPP" }))}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMAIL">E-mail</SelectItem>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
                <FieldHint text="Canal de destination prévu — l'envoi réel exigera un fournisseur correspondant." />
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel required>Objet</FieldLabel>
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="-10 % sur vos essentiels beauté"
                className="h-9"
                maxLength={160}
              />
            </div>

            <div className="space-y-1.5">
              <FieldLabel required>Contenu du message</FieldLabel>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={5}
                maxLength={3000}
                placeholder="Bonjour {{prenom}} 🌿 Votre beurre de karité préféré vous attend…"
              />
              <div className="flex items-center justify-between gap-2">
                <FieldHint text="La variable {{prenom}} sera remplacée par le prénom de chaque destinataire." />
                <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => setPreviewOpen(true)}>
                  <Eye className="mr-1 h-3.5 w-3.5" /> Ouvrir un aperçu
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel required>Audience</FieldLabel>
                <Select
                  value={form.segment}
                  onValueChange={(v) => setForm((f) => ({ ...f, segment: v as Segment }))}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SEGMENT_LABELS) as Segment[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {SEGMENT_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.segment === "CLIENTS_AVEC_COMMANDES" ? (
                <div className="space-y-1.5">
                  <FieldLabel>Commandes payées minimum</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={form.minOrders}
                    onChange={(e) => setForm((f) => ({ ...f, minOrders: Math.max(1, Number(e.target.value)) }))}
                    className="h-9"
                  />
                  <FieldHint text="Ne cibler que les clients ayant au moins ce nombre de commandes payées." />
                </div>
              ) : null}
            </div>

            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm",
                "border-emerald-200 bg-emerald-50 text-emerald-800",
              )}
            >
              <Users className="h-4 w-4 shrink-0" />
              {audienceLoading ? (
                <span className="text-sm text-emerald-700">Comptage de l'audience…</span>
              ) : (
                <span>
                  Cette campagne ciblerait <strong>≈ {audienceCount ?? 0} destinataire{(audienceCount ?? 0) > 1 ? "s" : ""}</strong>{" "}
                  <span className="text-xs text-emerald-700">(calcul en direct, lecture seule)</span>
                </span>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Programmation (optionnelle)</FieldLabel>
                <Input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                  className="h-9"
                />
                <FieldHint text="La campagne passera « Programmée » — l'envoi restera néanmoins inactif sans fournisseur configuré." />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Note interne</FieldLabel>
                <Input
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="À connecter au fournisseur avant envoi…"
                  className="h-9"
                  maxLength={500}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={busy}>
              {editing ? "Enregistrer" : "Créer la campagne"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog aperçu ---------- */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[min(34rem,95vw)]">
          <DialogHeader>
            <DialogTitle>Aperçu du message</DialogTitle>
            <DialogDescription>
              Rendu avec <span className="font-mono">{"{{prenom}}"}</span> remplacé par « Awa » — l'objet et le contenu
              définitifs dépendront du canal connecté.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border bg-white p-4 shadow-inner">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objet</p>
            <p className="mt-0.5 text-sm font-bold">{form.subject || "(sans objet)"}</p>
            <div className="my-3 border-t" />
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{previewContent || "(contenu vide)"}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Fermer l'aperçu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
