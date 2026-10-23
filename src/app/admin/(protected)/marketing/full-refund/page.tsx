"use client"

import { useCallback, useEffect, useState } from "react"
import {
  BadgePercent,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Coins,
  Gift,
  Percent,
  RotateCcw,
  Save,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { AdminPageHeader } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import { useAdminApi } from "@/components/admin/api-client"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"
import {
  FieldHint,
  FieldLabel,
  formatDateFR,
  RewardStatusBadge,
  ToneBadge,
  toLocalInputValue,
} from "@/components/admin/marketing/helpers"
import { RewardsPanel } from "@/components/admin/marketing/rewards-panel"

interface FullRefundProgramData {
  id: number
  name: string
  isActive: boolean
  requiredReferrals: number
  requiredPaidOrdersPerReferral: number
  minOrderAmountPerReferral: number
  minSourceOrderAmount: number
  refundPercent: number
  refundCap: number | null
  maxRewards: number | null
  holdPeriodDays: number
  rewardMode: "STORE_CREDIT" | "COUPON" | "MANUAL"
  eligibleProductIds: string[]
  eligibleCategoryIds: string[]
  terms: string | null
  startsAt: string | null
  endsAt: string | null
  updatedAt: string
}

interface FilleulProgress {
  filleul: { id: string; name: string; email: string }
  appliedAt: string | null
  isQualified: boolean
  qualifyingCount: number
  requiredCount: number
  orders: { orderNumber: string; eligibleAmount: number; eligible: boolean; paidAt: string | null }[]
}

interface Progression {
  parrain: { id: string; name: string; email: string; referralCode: string; storeCredit: number }
  qualifiedCount: number
  requiredReferrals: number
  filleuls: FilleulProgress[]
  candidateOrders: { orderNumber: string; eligibleAmount: number; eligible: boolean; alreadyRewarded: boolean; paidAt: string | null }[]
  rewards: {
    id: string
    amount: number
    status: string
    sourceOrderNumber: string | null
    reason: string
    eligibleAt: string | null
    createdAt: string
  }[]
}

interface FullRefundStats {
  parrainsWithReferrals: number
  granted: number
  pending: number
  credited: number
}

const REWARD_MODES_UI: { value: FullRefundProgramData["rewardMode"]; title: string; desc: string }[] = [
  { value: "STORE_CREDIT", title: "Crédit boutique", desc: "Remboursé sur le portefeuille après le délai de sécurisation." },
  { value: "COUPON", title: "Coupon dédié", desc: "Coupon 1 usage du montant remboursé, réservé au parrain." },
  { value: "MANUAL", title: "Paiement manuel", desc: "L'équipe paie hors plateforme puis marque « payée »." },
]

export default function FullRefundPage() {
  const api = useAdminApi()
  const [program, setProgram] = useState<FullRefundProgramData | null>(null)
  const [stats, setStats] = useState<FullRefundStats | null>(null)
  const [progressions, setProgressions] = useState<Progression[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const data = await api.get<{
      program: FullRefundProgramData
      stats: FullRefundStats
      progressions: Progression[]
    }>("/api/admin/marketing/full-refund-program")
    if (data) {
      setProgram(data.program)
      setStats(data.stats)
      setProgressions(data.progressions)
    }
    setLoading(false)
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const patchProgram = (partial: Partial<FullRefundProgramData>) => {
    setProgram((p) => (p ? { ...p, ...partial } : p))
  }

  const saveProgram = async () => {
    if (!program) return
    if (program.requiredReferrals < 1) {
      toast.error("Il faut au moins 1 filleul qualifié.")
      return
    }
    setSaving(true)
    const data = await api.patch("/api/admin/marketing/full-refund-program", {
      isActive: program.isActive,
      name: program.name,
      requiredReferrals: program.requiredReferrals,
      requiredPaidOrdersPerReferral: program.requiredPaidOrdersPerReferral,
      minOrderAmountPerReferral: program.minOrderAmountPerReferral,
      minSourceOrderAmount: program.minSourceOrderAmount,
      refundPercent: program.refundPercent,
      refundCap: program.refundCap,
      maxRewards: program.maxRewards,
      holdPeriodDays: program.holdPeriodDays,
      rewardMode: program.rewardMode,
      terms: program.terms,
      startsAt: program.startsAt ? toLocalInputValue(program.startsAt) : null,
      endsAt: program.endsAt ? toLocalInputValue(program.endsAt) : null,
    })
    if (data) {
      toast.success("Programme de remboursement enregistré.")
      void load()
    }
    setSaving(false)
  }

  return (
    <div>
      <AdminPageHeader
        title="Remboursement intégral par parrainage"
        description="Recommandez N clients fidèles → votre prochaine commande éligible vous est remboursée (jusqu'à 100 %, plafond configurable)."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Parrains suivis" value={stats?.parrainsWithReferrals ?? 0} icon={Users} hint="clients avec ≥ 1 filleul" loading={loading} />
        <StatCard label="Remboursements accordés" value={stats?.granted ?? 0} isCurrency icon={Coins} loading={loading} />
        <StatCard label="En attente" value={stats?.pending ?? 0} isCurrency icon={RotateCcw} loading={loading} />
        <StatCard label="Crédités" value={stats?.credited ?? 0} isCurrency icon={Gift} loading={loading} />
      </div>

      <Tabs defaultValue="progressions">
        <TabsList>
          <TabsTrigger value="progressions">Progression des parrains</TabsTrigger>
          <TabsTrigger value="programme">Programme</TabsTrigger>
          <TabsTrigger value="recompenses">Récompenses</TabsTrigger>
        </TabsList>

        {/* ---------- Onglet Progressions (le cœur) ---------- */}
        <TabsContent value="progressions" className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : progressions.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-secondary/30 px-6 py-10 text-center">
              <Users className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">Aucun parrain à suivre</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Dès qu'un client aura au moins un filleul, sa progression vers le remboursement s'affichera ici en détail.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Le comptage « filleul qualifié » reprend exactement la règle du moteur : commandes payées non annulées
                d'au moins {formatXOF(program?.minOrderAmountPerReferral ?? 0)} de sous-total éligible, minimum{" "}
                {program?.requiredPaidOrdersPerReferral ?? 1} par filleul. Le remboursement cible ensuite la commande
                éligible du parrain (≥ {formatXOF(program?.minSourceOrderAmount ?? 0)}), jamais déjà remboursée.
              </p>
              {progressions.map((prog) => {
                const pct = Math.min(
                  100,
                  Math.round((prog.qualifiedCount / Math.max(1, prog.requiredReferrals)) * 100),
                )
                const eligibleSources = prog.candidateOrders.filter((o) => o.eligible && !o.alreadyRewarded)
                return (
                  <article key={prog.parrain.id} className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold leading-tight">{prog.parrain.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {prog.parrain.email} · code <span className="font-mono">{prog.parrain.referralCode}</span> ·
                          portefeuille {formatXOF(prog.parrain.storeCredit)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ToneBadge tone={pct >= 100 ? "ok" : "pending"}>
                          {prog.qualifiedCount} / {prog.requiredReferrals} filleuls qualifiés
                        </ToneBadge>
                        {pct >= 100 && eligibleSources.length > 0 && (
                          <ToneBadge tone="ok">Objectif atteint — remboursement déclenchable</ToneBadge>
                        )}
                      </div>
                    </div>

                    <Progress value={pct} className="mb-4 h-2 [&>div]:bg-amber-500" />

                    <div className="grid gap-4 lg:grid-cols-3">
                      {/* Filleuls */}
                      <div className="min-w-0">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Filleuls ({prog.filleuls.length})
                        </h4>
                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                          {prog.filleuls.map((f) => (
                            <div
                              key={f.filleul.id}
                              className={cn(
                                "rounded-lg border p-2.5",
                                f.isQualified ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/40",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-medium leading-tight">{f.filleul.name}</p>
                                {f.isQualified ? (
                                  <ToneBadge tone="ok">Qualifié</ToneBadge>
                                ) : (
                                  <ToneBadge tone="pending">
                                    {f.qualifyingCount}/{f.requiredCount} commande(s)
                                  </ToneBadge>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                rattaché le {formatDateFR(f.appliedAt)}
                              </p>
                              {f.orders.length > 0 && (
                                <ul className="mt-1.5 space-y-0.5">
                                  {f.orders.map((o) => (
                                    <li key={o.orderNumber} className="flex items-center justify-between gap-2 text-xs">
                                      <span className="flex items-center gap-1 truncate">
                                        {o.eligible ? (
                                          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
                                        ) : (
                                          <Circle className="h-3 w-3 shrink-0 text-muted-foreground" />
                                        )}
                                        <span className="font-mono">{o.orderNumber}</span>
                                      </span>
                                      <span className="tabular-nums text-muted-foreground">
                                        {formatXOF(o.eligibleAmount)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Commandes sources candidates */}
                      <div className="min-w-0">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Commandes remboursables du parrain
                        </h4>
                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                          {prog.candidateOrders.length === 0 ? (
                            <p className="rounded-lg bg-secondary/60 p-2.5 text-xs text-muted-foreground">
                              Aucune commande payée pour l'instant.
                            </p>
                          ) : (
                            prog.candidateOrders.map((o) => (
                              <div
                                key={o.orderNumber}
                                className={cn(
                                  "rounded-lg border p-2.5",
                                  o.eligible && !o.alreadyRewarded
                                    ? "border-emerald-200 bg-emerald-50/60"
                                    : o.alreadyRewarded
                                      ? "border-neutral-200 bg-secondary/40"
                                      : "border-dashed",
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-xs">{o.orderNumber}</span>
                                  <span className="text-xs tabular-nums">{formatXOF(o.eligibleAmount)}</span>
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {o.alreadyRewarded
                                    ? "déjà remboursée dans ce programme"
                                    : o.eligible
                                      ? "éligible au remboursement"
                                      : `sous le minimum (${formatXOF(program?.minSourceOrderAmount ?? 0)})`}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Récompenses générées */}
                      <div className="min-w-0">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Récompenses générées
                        </h4>
                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                          {prog.rewards.length === 0 ? (
                            <p className="rounded-lg bg-secondary/60 p-2.5 text-xs text-muted-foreground">
                              {pct >= 100 && eligibleSources.length > 0
                                ? "Prêt : la prochaine commande payée d'un filleul déclenchera le remboursement automatique."
                                : "Le remboursement sera créé automatiquement dès que l'objectif est atteint et qu'une commande éligible existe."}
                            </p>
                          ) : (
                            prog.rewards.map((r) => (
                              <div key={r.id} className="rounded-lg border p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold tabular-nums">{formatXOF(r.amount)}</span>
                                  <RewardStatusBadge status={r.status} />
                                </div>
                                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{r.reason}</p>
                                {r.sourceOrderNumber && (
                                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                                    {r.sourceOrderNumber}
                                  </p>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ---------- Onglet Programme ---------- */}
        <TabsContent value="programme" className="mt-4">
          {loading || !program ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-brand-soft p-1.5 text-brand-foreground">
                    <BadgePercent className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <div>
                    <h2 className="text-base font-bold leading-tight">{program.name}</h2>
                    <p className="text-xs text-muted-foreground">Singleton unique (id 1) — mis à jour le {formatDateFR(program.updatedAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="fr-active" checked={program.isActive} onCheckedChange={(v) => patchProgram({ isActive: v })} />
                  <label htmlFor="fr-active" className="cursor-pointer text-sm font-medium">
                    {program.isActive ? "Actif" : "Désactivé"}
                  </label>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel>Nom du programme</FieldLabel>
                  <Input value={program.name} onChange={(e) => patchProgram({ name: e.target.value })} className="h-9" />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel required>Filleuls qualifiés requis</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={program.requiredReferrals}
                    onChange={(e) => patchProgram({ requiredReferrals: Math.max(1, Number(e.target.value)) })}
                    className="h-9"
                  />
                  <FieldHint text="Nombre de filleuls qui doivent atteindre le critère ci-dessous pour débloquer le remboursement." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel required>Commandes payées exigées par filleul</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={program.requiredPaidOrdersPerReferral}
                    onChange={(e) =>
                      patchProgram({ requiredPaidOrdersPerReferral: Math.max(1, Number(e.target.value)) })
                    }
                    className="h-9"
                  />
                  <FieldHint text="Chaque filleul doit avoir au moins ce nombre de commandes payées admissibles." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel required>Montant minimum par commande de filleul (FCFA)</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    value={program.minOrderAmountPerReferral}
                    onChange={(e) => patchProgram({ minOrderAmountPerReferral: Number(e.target.value) })}
                    className="h-9"
                  />
                  <FieldHint text="Sous-total éligible minimal pour qu'une commande du filleul compte comme admissible." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel required>Montant minimum de la commande remboursable (FCFA)</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    value={program.minSourceOrderAmount}
                    onChange={(e) => patchProgram({ minSourceOrderAmount: Number(e.target.value) })}
                    className="h-9"
                  />
                  <FieldHint text="La commande du PARRAIN doit atteindre ce montant éligible pour être remboursée." />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <FieldLabel required>
                    Pourcentage remboursé : <span className="text-amber-700">{program.refundPercent} %</span>
                  </FieldLabel>
                  <Slider
                    value={[program.refundPercent]}
                    min={1}
                    max={100}
                    step={5}
                    onValueChange={([v]) => patchProgram({ refundPercent: v })}
                    className="[&_[role=slider]]:border-amber-500 [&_[role=slider]]:bg-amber-500"
                  />
                  <FieldHint text="100 % = remboursement intégral (dans la limite du plafond ci-dessous)." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>Plafond de remboursement (FCFA)</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={program.refundCap ?? ""}
                    placeholder="Aucun plafond"
                    onChange={(e) => patchProgram({ refundCap: e.target.value === "" ? null : Number(e.target.value) })}
                    className="h-9"
                  />
                  <FieldHint text="Borne le remboursement même sur une commande très élevée." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>Remboursements max (global)</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={program.maxRewards ?? ""}
                    placeholder="Illimité"
                    onChange={(e) => patchProgram({ maxRewards: e.target.value === "" ? null : Number(e.target.value) })}
                    className="h-9"
                  />
                  <FieldHint text="Budget maximal du programme : au-delà, aucune nouvelle récompense n'est créée." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>Délai de sécurisation (jours)</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    value={program.holdPeriodDays}
                    onChange={(e) => patchProgram({ holdPeriodDays: Number(e.target.value) })}
                    className="h-9"
                  />
                  <FieldHint text="La récompense reste en attente pendant ce délai — protection contre les annulations en cascade." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel required>Mode de versement</FieldLabel>
                  <div className="grid gap-2">
                    {REWARD_MODES_UI.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => patchProgram({ rewardMode: m.value })}
                        className={cn(
                          "rounded-xl border p-2.5 text-left transition",
                          program.rewardMode === m.value
                            ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                            : "hover:bg-secondary/60",
                        )}
                      >
                        <p className="text-sm font-semibold leading-tight">{m.title}</p>
                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{m.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 md:col-span-2">
                  <div className="space-y-1.5">
                    <FieldLabel>Début</FieldLabel>
                    <Input
                      type="datetime-local"
                      value={toLocalInputValue(program.startsAt)}
                      onChange={(e) => patchProgram({ startsAt: e.target.value || null })}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Fin</FieldLabel>
                    <Input
                      type="datetime-local"
                      value={toLocalInputValue(program.endsAt)}
                      onChange={(e) => patchProgram({ endsAt: e.target.value || null })}
                      className="h-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <FieldLabel>Conditions (CGU)</FieldLabel>
                  <Textarea
                    value={program.terms ?? ""}
                    onChange={(e) => patchProgram({ terms: e.target.value })}
                    rows={4}
                    maxLength={4000}
                  />
                  <FieldHint text="Expliquez la règle complète : N filleuls, montants minimaux, plafond, délai avant versement." />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 border-t pt-4">
                <Button onClick={saveProgram} disabled={saving}>
                  <Save className="mr-1.5 h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer le programme"}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ---------- Onglet Récompenses ---------- */}
        <TabsContent value="recompenses" className="mt-4">
          <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Les approbations suivent les mêmes règles financières que la commission : transaction crédit boutique
              (STORE_CREDIT), coupon dédié (COUPON) ou validation puis paiement manuel (MANUAL). Annuler une
              récompense déjà créditée débite le portefeuille.
            </p>
          </div>
          <RewardsPanel program="FULL_REFUND" title="Récompenses de remboursement intégral" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
