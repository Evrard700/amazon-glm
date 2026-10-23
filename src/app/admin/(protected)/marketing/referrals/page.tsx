"use client"

import { useCallback, useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import {
  BadgeCheck,
  Coins,
  HandCoins,
  Percent,
  Save,
  Share2,
  ShoppingBag,
  Users,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
} from "@/components/admin/marketing/entity-picker"
import { useLightLists } from "@/components/admin/marketing/use-light-lists"
import { RewardsPanel } from "@/components/admin/marketing/rewards-panel"
import { Users2 } from "lucide-react"

interface ReferralProgramData {
  id: number
  name: string
  isActive: boolean
  commissionType: "PERCENT" | "FIXED"
  commissionValue: number
  capPerReward: number | null
  baseCalculation: string
  minOrderAmount: number
  eligibleProductIds: string[]
  eligibleCategoryIds: string[]
  maxRewardsPerReferrer: number | null
  maxReferralsPerReferrer: number | null
  holdPeriodDays: number
  rewardMode: "STORE_CREDIT" | "COUPON" | "MANUAL"
  terms: string | null
  startsAt: string | null
  endsAt: string | null
  updatedAt: string
}

interface Attribution {
  filleul: { id: string; name: string; email: string }
  parrain: { id: string; name: string; email: string; referralCode: string } | null
  source: string
  appliedAt: string | null
  paidOrdersCount: number
  paidTotal: number
}

interface ReferralStats {
  granted: number
  pending: number
  credited: number
  referredRevenue: number
  referrerCount: number
  referredCount: number
  rewardsCount: number
}

const REWARD_MODES_UI: { value: ReferralProgramData["rewardMode"]; title: string; desc: string }[] = [
  { value: "STORE_CREDIT", title: "Crédit boutique", desc: "Crédité au portefeuille après le délai de sécurisation — dépensable comme de l'argent." },
  { value: "COUPON", title: "Coupon dédié", desc: "Un coupon 1 usage réservé au parrain est généré automatiquement." },
  { value: "MANUAL", title: "Paiement manuel", desc: "L'équipe valide puis paie hors plateforme (Wave, espèces…) et marque « payée »." },
]

export default function ReferralsPage() {
  const api = useAdminApi()
  const { products, categories, loaded: listsLoaded } = useLightLists({ products: true, categories: true })

  const [program, setProgram] = useState<ReferralProgramData | null>(null)
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [attributions, setAttributions] = useState<Attribution[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const data = await api.get<{
      program: ReferralProgramData
      stats: ReferralStats
      attributions: Attribution[]
    }>("/api/admin/marketing/referral-program")
    if (data) {
      setProgram(data.program)
      setStats(data.stats)
      setAttributions(data.attributions)
    }
    setLoading(false)
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const patchProgram = (partial: Partial<ReferralProgramData>) => {
    setProgram((p) => (p ? { ...p, ...partial } : p))
  }

  const saveProgram = async () => {
    if (!program) return
    if (program.commissionType === "PERCENT" && (program.commissionValue < 1 || program.commissionValue > 100)) {
      toast.error("Un pourcentage de commission doit être compris entre 1 et 100.")
      return
    }
    if (program.commissionType === "FIXED" && program.commissionValue < 1) {
      toast.error("Le montant de commission doit être supérieur à 0 FCFA.")
      return
    }
    setSaving(true)
    const data = await api.patch("/api/admin/marketing/referral-program", {
      isActive: program.isActive,
      name: program.name,
      commissionType: program.commissionType,
      commissionValue: program.commissionValue,
      capPerReward: program.capPerReward,
      baseCalculation: "SUBTOTAL",
      minOrderAmount: program.minOrderAmount,
      eligibleProductIds: program.eligibleProductIds,
      eligibleCategoryIds: program.eligibleCategoryIds,
      maxRewardsPerReferrer: program.maxRewardsPerReferrer,
      maxReferralsPerReferrer: program.maxReferralsPerReferrer,
      holdPeriodDays: program.holdPeriodDays,
      rewardMode: program.rewardMode,
      terms: program.terms,
      startsAt: program.startsAt ? toLocalInputValue(program.startsAt) : null,
      endsAt: program.endsAt ? toLocalInputValue(program.endsAt) : null,
    })
    if (data) {
      toast.success("Programme de parrainage enregistré.")
      void load()
    }
    setSaving(false)
  }

  const attrColumns: ColumnDef<Attribution, unknown>[] = [
    {
      id: "filleul",
      header: "Filleul",
      cell: ({ row }) => (
        <div className="min-w-44">
          <p className="font-medium leading-tight">{row.original.filleul.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.filleul.email}</p>
        </div>
      ),
    },
    {
      id: "parrain",
      header: "Parrain",
      cell: ({ row }) => (
        <div className="min-w-44">
          {row.original.parrain ? (
            <>
              <p className="font-medium leading-tight">{row.original.parrain.name}</p>
              <p className="text-xs text-muted-foreground">
                code <span className="font-mono">{row.original.parrain.referralCode}</span>
              </p>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => (
        <ToneBadge tone={row.original.source === "SIGNUP" ? "ok" : "brand"}>
          {row.original.source === "SIGNUP" ? "À l'inscription" : "Au paiement"}
        </ToneBadge>
      ),
    },
    {
      id: "appliedAt",
      header: "Depuis",
      cell: ({ row }) => <span className="text-xs">{formatDateFR(row.original.appliedAt)}</span>,
    },
    {
      accessorKey: "paidOrdersCount",
      header: "Commandes payées",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.paidOrdersCount}
          {row.original.paidOrdersCount === 0 && (
            <span className="ml-1 text-xs text-muted-foreground">(pas encore)</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "paidTotal",
      header: "Total dépensé",
      cell: ({ row }) => (
        <span className="text-sm font-semibold tabular-nums">{formatXOF(row.original.paidTotal)}</span>
      ),
    },
  ]

  return (
    <div>
      <AdminPageHeader
        title="Parrainage à la commission"
        description="Vos clients gagnent un pourcentage (ou un montant fixe) sur les commandes payées de leurs filleuls — crédité uniquement par le cycle serveur."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Commissions accordées"
          value={stats?.granted ?? 0}
          isCurrency
          icon={Coins}
          hint="récompenses non annulées"
          loading={loading}
        />
        <StatCard label="En attente" value={stats?.pending ?? 0} isCurrency icon={HandCoins} hint="délai de sécurisation" loading={loading} />
        <StatCard label="Créditées" value={stats?.credited ?? 0} isCurrency icon={Wallet} loading={loading} />
        <StatCard
          label="CA généré par les filleuls"
          value={stats?.referredRevenue ?? 0}
          isCurrency
          icon={ShoppingBag}
          hint={`${stats?.referrerCount ?? 0} parrain(s) · ${stats?.referredCount ?? 0} filleul(s)`}
          loading={loading}
        />
      </div>

      <Tabs defaultValue="programme">
        <TabsList>
          <TabsTrigger value="programme">Programme</TabsTrigger>
          <TabsTrigger value="attributions">Attributions ({attributions.length})</TabsTrigger>
          <TabsTrigger value="recompenses">Récompenses</TabsTrigger>
        </TabsList>

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
                    <Share2 className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <div>
                    <h2 className="text-base font-bold leading-tight">{program.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      Singleton unique (id 1) — dernière mise à jour le {formatDateFR(program.updatedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="program-active" checked={program.isActive} onCheckedChange={(v) => patchProgram({ isActive: v })} />
                  <label htmlFor="program-active" className="cursor-pointer text-sm font-medium">
                    {program.isActive ? "Programme actif" : "Programme désactivé"}
                  </label>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel required>Nom du programme</FieldLabel>
                  <Input
                    value={program.name}
                    onChange={(e) => patchProgram({ name: e.target.value })}
                    className="h-9"
                  />
                  <FieldHint text="Affiché aux clients dans leur espace « Parrainage »." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel required>Mode de commission</FieldLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: "PERCENT", label: "Pourcentage", icon: Percent },
                        { value: "FIXED", label: "Montant fixe", icon: Coins },
                      ] as const
                    ).map((m) => {
                      const Icon = m.icon
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => patchProgram({ commissionType: m.value })}
                          className={cn(
                            "flex items-center gap-2 rounded-xl border p-2.5 text-left text-sm font-medium transition",
                            program.commissionType === m.value
                              ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                              : "hover:bg-secondary/60",
                          )}
                        >
                          <Icon className="h-4 w-4 text-amber-600" /> {m.label}
                        </button>
                      )
                    })}
                  </div>
                  <FieldHint
                    text={
                      program.commissionType === "PERCENT"
                        ? "Ex. : 5 % du sous-total éligible de chaque commande payée du filleul."
                        : "Ex. : 1 000 FCFA par commande payée du filleul (montant entier)."
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel required>
                    {program.commissionType === "PERCENT" ? "Valeur (%)" : "Valeur (FCFA)"}
                  </FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={program.commissionValue}
                    onChange={(e) => patchProgram({ commissionValue: Number(e.target.value) })}
                    className="h-9"
                  />
                  <FieldHint text="Les montants sont toujours arrondis au FCFA entier (demi-sup)." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>Plafond par récompense (FCFA)</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={program.capPerReward ?? ""}
                    placeholder="Aucun plafond"
                    onChange={(e) =>
                      patchProgram({ capPerReward: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    className="h-9"
                  />
                  <FieldHint text="Borne la commission même sur de très grosses commandes. Vide = illimité." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>Montant minimum de commande (FCFA)</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    value={program.minOrderAmount}
                    onChange={(e) => patchProgram({ minOrderAmount: Number(e.target.value) })}
                    className="h-9"
                  />
                  <FieldHint text="Les commandes du filleul en dessous de ce seuil éligible ne génèrent aucune commission." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>Base de calcul</FieldLabel>
                  <div className="flex h-9 items-center rounded-md border bg-secondary/50 px-3 text-sm text-muted-foreground">
                    Sous-total hors livraison (articles éligibles)
                  </div>
                  <FieldHint text="Les frais de livraison ne sont jamais commissionnés — base saine anti-abus." />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <FieldLabel>Catalogue éligible (produits / catégories)</FieldLabel>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {listsLoaded ? (
                      <>
                        <ProductMultiPicker
                          products={products}
                          selected={program.eligibleProductIds}
                          onChange={(ids) => patchProgram({ eligibleProductIds: ids })}
                        />
                        <CategoryMultiPicker
                          categories={categories}
                          selected={program.eligibleCategoryIds}
                          onChange={(ids) => patchProgram({ eligibleCategoryIds: ids })}
                        />
                      </>
                    ) : (
                      <>
                        <Skeleton className="h-9 w-full" />
                        <Skeleton className="h-9 w-full" />
                      </>
                    )}
                  </div>
                  <FieldHint text="Vide = tout le catalogue est éligible. Sinon, seuls les articles listés (produits OU catégories) génèrent une commission." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>Récompenses max par parrain</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={program.maxRewardsPerReferrer ?? ""}
                    placeholder="Illimité"
                    onChange={(e) =>
                      patchProgram({ maxRewardsPerReferrer: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    className="h-9"
                  />
                  <FieldHint text="Bloque les abus : un parrain ne peut pas cumuler au-delà de ce nombre de commissions." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>Filleuls max par parrain</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    value={program.maxReferralsPerReferrer ?? ""}
                    placeholder="Illimité"
                    onChange={(e) =>
                      patchProgram({ maxReferralsPerReferrer: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    className="h-9"
                  />
                  <FieldHint text="Un client n'a de toute façon qu'un seul parrain (anti-fraude à l'attribution)." />
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
                  <FieldHint text="La commission reste « en attente » pendant ce délai après paiement — le temps de couvrir retours et annulations. Passé ce délai, le cycle serveur la crédite automatiquement." />
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
                  <FieldHint text="Le mode s'applique aux futures récompenses ; les récompenses existantes gardent le mode enregistré à leur création (snapshot)." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>Début du programme</FieldLabel>
                  <Input
                    type="datetime-local"
                    value={toLocalInputValue(program.startsAt)}
                    onChange={(e) => patchProgram({ startsAt: e.target.value || null })}
                    className="h-9"
                  />
                  <FieldHint text="Vide = actif dès maintenant (si le programme est actif)." />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>Fin du programme</FieldLabel>
                  <Input
                    type="datetime-local"
                    value={toLocalInputValue(program.endsAt)}
                    onChange={(e) => patchProgram({ endsAt: e.target.value || null })}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <FieldLabel>Conditions (CGU du parrainage)</FieldLabel>
                  <Textarea
                    value={program.terms ?? ""}
                    onChange={(e) => patchProgram({ terms: e.target.value })}
                    rows={4}
                    maxLength={4000}
                    placeholder="Règles affichées au client : délais, plafonds, exclusions…"
                  />
                  <FieldHint text="Texte juridique affiché dans l'espace client « Parrainage ». Rédigez clairement délais et plafonds." />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 border-t pt-4">
                <ToneBadge tone={program.isActive ? "ok" : "neutral"}>
                  {program.isActive ? "Programme actif" : "Programme arrêté"}
                </ToneBadge>
                <Button onClick={saveProgram} disabled={saving || !listsLoaded}>
                  <Save className="mr-1.5 h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer le programme"}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ---------- Onglet Attributions ---------- */}
        <TabsContent value="attributions" className="mt-4">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : attributions.length === 0 ? (
            <MarketingEmptyState
              icon={Users2}
              title="Aucune attribution"
              description="Les rattachements filleul ← parrain apparaîtront ici dès qu'un client utilisera un code de parrainage (inscription ou paiement)."
            />
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Un client ne peut avoir qu'un seul parrain, attribué soit à l'inscription, soit au moment du paiement — jamais modifiable ensuite.
              </p>
              <DataTable
                columns={attrColumns}
                data={attributions}
                searchPlaceholder="Rechercher un filleul ou un parrain…"
                emptyMessage="Aucune attribution."
                pageSize={10}
              />
            </>
          )}
        </TabsContent>

        {/* ---------- Onglet Récompenses ---------- */}
        <TabsContent value="recompenses" className="mt-4">
          <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Au chargement de cet onglet, les récompenses arrivées à échéance passent automatiquement en « Disponible »
              (cycle serveur <span className="font-mono">processDueRewards</span>) : le portefeuille n'est JAMAIS crédité par
              une simple modification de solde.
            </p>
          </div>
          <RewardsPanel program="COMMISSION" title="Récompenses de commission" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
