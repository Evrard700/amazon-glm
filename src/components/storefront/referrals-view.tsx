"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Clock,
  Coins,
  Copy,
  Gift,
  Link2,
  Loader2,
  PartyPopper,
  Share2,
  TrendingUp,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { EmptyState } from "@/components/storefront/empty-state"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"

interface ReferralStats {
  stats: {
    filleulsCount: number
    eligibleOrdersCount: number
    pendingRewards: number
    availableRewards: number
    totalEarned: number
  }
  fullRefundProgress: { qualified: number; required: number }
  programs: {
    commission: { name: string; terms: string | null; commissionType: string; commissionValue: number; capPerReward: number | null; minOrderAmount: number; holdPeriodDays: number; isActive: boolean }
    fullRefund: { name: string; terms: string | null; requiredReferrals: number; requiredPaidOrdersPerReferral: number; minOrderAmountPerReferral: number; minSourceOrderAmount: number; refundPercent: number; refundCap: number | null; isActive: boolean }
  }
}

interface ReferralsData extends ReferralStats {
  referralCode: string
  storeCredit: number
  filleuls: { id: string; name: string; since: string; commissionPaid: boolean; frpQualifyingOrders: number }[]
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })

/** Page marketing « Parrainage » — données agrégées serveur via GET /api/account/referrals. */
export function ReferralsView() {
  const [data, setData] = useState<ReferralsData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [copied, setCopied] = useState<"code" | "link" | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/account/referrals", { cache: "no-store" })
        const json = await res.json()
        if (cancelled) return
        if (json.ok) {
          setData(json.data as ReferralsData)
        } else {
          setLoadError(true)
        }
      } catch {
        if (!cancelled) setLoadError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function copy(value: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      toast.success(kind === "code" ? "Code copié !" : "Lien copié !")
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error("Copie impossible — sélectionnez le code manuellement.")
    }
  }

  if (loadError) {
    return (
      <EmptyState
        title="Impossible de charger le parrainage"
        description="Rechargez la page ou reconnectez-vous."
      />
    )
  }

  if (!data) {
    return (
      <div aria-busy="true" aria-label="Chargement du parrainage" className="space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  // window n'existe que côté navigateur — lu au rendu client une fois les
  // données chargées (aucune divergence d'hydratation : data est null au 1er rendu).
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const shareUrl = `${origin}/register?ref=${data.referralCode}`
  const progressPct = Math.min(100, Math.round((data.fullRefundProgress.qualified / data.fullRefundProgress.required) * 100))
  const commission = data.programs.commission
  const fullRefund = data.programs.fullRefund
  const commissionLabel =
    commission.commissionType === "PERCENT"
      ? `${commission.commissionValue} % du montant hors livraison`
      : `${formatXOF(commission.commissionValue)} par commande éligible`

  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Parrainage : partagez, gagnez</h1>
        <p className="text-sm text-muted-foreground">
          Invitez vos proches avec votre code et touchez une commission sur chacune de leurs commandes payées.
        </p>
      </header>

      {/* ---- Hero : code + lien ---- */}
      <Card className="overflow-hidden border-brand/50 bg-gradient-to-br from-brand-soft/80 to-card">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-foreground">
              <PartyPopper className="h-4 w-4" /> Votre code de parrainage
            </p>
            <p className="mt-1 font-mono text-4xl font-black tracking-widest sm:text-5xl">{data.referralCode}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={() => copy(data.referralCode, "code")} className="gap-1.5 bg-brand font-bold text-brand-foreground hover:brightness-95">
                {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "code" ? "Code copié" : "Copier le code"}
              </Button>
              <Button onClick={() => copy(shareUrl, "link")} variant="outline" className="gap-1.5">
                {copied === "link" ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                {copied === "link" ? "Lien copié" : "Copier le lien d'invitation"}
              </Button>
            </div>
          </div>
          <div className="max-w-xs rounded-xl border bg-card/80 p-3.5 text-xs text-muted-foreground shadow-inner">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <Share2 className="h-4 w-4" /> Comment ça marche ?
            </p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 leading-relaxed">
              <li>Partagez votre code ou ce lien :</li>
              <li>
                <span className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{shareUrl}</span>
              </li>
              <li>Votre filleul s&apos;inscrit avec le code.</li>
              <li>Vous touchez {commissionLabel}{commission.capPerReward !== null ? ` (plafond ${formatXOF(commission.capPerReward)} par commande)` : ""}.</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* ---- Statistiques ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Filleuls parrainés", value: data.stats.filleulsCount, icon: Users },
          { label: "Commandes éligibles", value: data.stats.eligibleOrdersCount, icon: BadgeCheck },
          { label: "En attente de validation", value: data.stats.pendingRewards, money: true, icon: Clock },
          { label: "Total gagné", value: data.stats.totalEarned, money: true, icon: Coins },
        ].map((stat) => (
          <Card key={stat.label} className="shadow-sm">
            <CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <stat.icon className="h-3.5 w-3.5" /> {stat.label}
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">
                {stat.money ? formatXOF(stat.value) : stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        {/* ---- Progression remboursement intégral ---- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-brand-foreground" /> {fullRefund.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Parrainez <strong>{fullRefund.requiredReferrals} filleuls qualifiés</strong> (chacun avec{" "}
              {fullRefund.requiredPaidOrdersPerReferral} commande{fullRefund.requiredPaidOrdersPerReferral > 1 ? "s" : ""} payée
              {fullRefund.requiredPaidOrdersPerReferral > 1 ? "s" : ""} d&apos;au moins {formatXOF(fullRefund.minOrderAmountPerReferral)}){" "}
              et récupérez jusqu&apos;à <strong>{fullRefund.refundPercent} %</strong>
              {fullRefund.refundCap !== null ? ` (plafond ${formatXOF(fullRefund.refundCap)})` : ""} de votre dernière commande
              éligible payée d&apos;au moins {formatXOF(fullRefund.minSourceOrderAmount)}.
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Progression</span>
                <span>
                  {data.fullRefundProgress.qualified}/{data.fullRefundProgress.required} filleuls qualifiés
                </span>
              </div>
              <Progress value={progressPct} aria-label={`${data.fullRefundProgress.qualified} filleuls qualifiés sur ${data.fullRefundProgress.required}`} />
            </div>
            <p className="text-xs text-muted-foreground">
              Crédit boutique disponible : <strong className="text-emerald-600">{formatXOF(data.storeCredit)}</strong> — utilisable
              directement au paiement de vos commandes.
            </p>
          </CardContent>
        </Card>

        {/* ---- Tableau filleuls ---- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-brand-foreground" /> Vos filleuls
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.filleuls.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun filleul pour l&apos;instant — partagez votre code {data.referralCode} pour démarrer vos gains.
              </p>
            ) : (
              <ul className="scrollbar-thin max-h-72 divide-y overflow-y-auto pr-1">
                {data.filleuls.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">Parrainé(e) le {dateFmt.format(new Date(f.since))}</p>
                    </div>
                    {f.commissionPaid ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> Commande payée
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
                        <Clock className="h-3.5 w-3.5" /> En attente
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Conditions des programmes ---- */}
      <Card>
        <CardContent className="p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
            <Gift className="h-4 w-4 text-brand-foreground" /> Conditions des programmes
          </h2>
          {/* Accordéon natif <details> : interactif sans JS, zéro id useId (hydratation stable). */}
          <div className="mt-2">
            <details className="group border-b last:border-b-0" open>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-left text-sm font-semibold hover:text-brand-foreground [&::-webkit-details-marker]:hidden">
                {commission.name} — {commissionLabel}{commission.capPerReward !== null ? ` (plafond ${formatXOF(commission.capPerReward)})` : ""}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
              </summary>
              <div className="pb-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {commission.terms ?? "Contactez le support pour les conditions détaillées."}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Commande éligible à partir de {formatXOF(commission.minOrderAmount)} hors livraison — créditée {commission.holdPeriodDays} jours
                  après paiement confirmé (délai anti-fraude).
                </p>
              </div>
            </details>
            <details className="group border-b last:border-b-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-left text-sm font-semibold hover:text-brand-foreground [&::-webkit-details-marker]:hidden">
                {fullRefund.name}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
              </summary>
              <div className="pb-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {fullRefund.terms ?? "Contactez le support pour les conditions détaillées."}
                </p>
              </div>
            </details>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
