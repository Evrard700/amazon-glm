import Link from "next/link"
import { db } from "@/lib/db"
import { requireUserPage } from "@/components/storefront/account-guard"
import { processDueRewards } from "@/lib/services/referrals"
import { RewardStatusBadge } from "@/components/storefront/status-badge"
import { EmptyState } from "@/components/storefront/empty-state"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatXOF } from "@/lib/money"
import { Coins, HelpCircle, Info, PackageSearch, TicketPercent, Wallet } from "lucide-react"

export const metadata = { title: "Mes récompenses" }

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })

const PROGRAM_LABELS: Record<string, string> = {
  COMMISSION: "Commission parrainage",
  FULL_REFUND: "Remboursement intégral",
}

/** Page récompenses : fait aussi mûrir les récompenses échues (processDueRewards, idempotent). */
export default async function AccountRewardsPage() {
  const user = await requireUserPage("/account/rewards")

  // Les récompenses dont le délai anti-fraude est écoulé passent en crédit boutique
  await processDueRewards()
  const me = await db.user.findUniqueOrThrow({ where: { id: user.id } })

  const rewards = await db.reward.findMany({
    where: { beneficiaryId: user.id },
    orderBy: { createdAt: "desc" },
    include: { sourceOrder: { select: { orderNumber: true } } },
  })

  const available = rewards.filter((r) => r.status === "REWARD_AVAILABLE").reduce((s, r) => s + r.amount, 0)
  const pending = rewards
    .filter((r) => r.status === "REWARD_PENDING" || r.status === "REWARD_APPROVED")
    .reduce((s, r) => s + r.amount, 0)

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Mes récompenses</h1>
          <p className="text-sm text-muted-foreground">
            Commissions de parrainage et remboursements — de la validation au crédit boutique.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href="/account/referrals">
            <TicketPercent className="h-4 w-4" /> Page parrainage
          </Link>
        </Button>
      </header>

      {/* Totaux */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" /> Crédit disponible
            </p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-600">{formatXOF(me.storeCredit)}</p>
            <p className="text-xs text-muted-foreground">Utilisable dès votre prochaine commande.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Coins className="h-3.5 w-3.5" /> En cours de validation
            </p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{formatXOF(pending)}</p>
            <p className="text-xs text-muted-foreground">Crédité après le délai anti-fraude.</p>
          </CardContent>
        </Card>
      </div>

      {/* Explication pédagogique des statuts */}
      <Alert>
        <HelpCircle className="h-4 w-4" />
        <AlertTitle>Comment lire ces statuts ?</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-4">
            <li><strong>En attente de validation</strong> — le paiement de la commande déclencheuse est confirmé ; un délai anti-fraude s&apos;applique avant mise à disposition.</li>
            <li><strong>Validée</strong> — la récompense est confirmée par l&apos;équipe et sera payée manuellement (mode choisi par la boutique).</li>
            <li><strong>Disponible</strong> — créditée sur votre portefeuille boutique : utilisez-la au paiement de vos commandes.</li>
            <li><strong>Utilisée</strong> — dépensée lors d&apos;une commande.</li>
            <li><strong>Payée</strong> — versée manuellement hors boutique.</li>
            <li><strong>Annulée</strong> — la commande liée a été annulée ou remboursée.</li>
          </ul>
        </AlertDescription>
      </Alert>

      {rewards.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Aucune récompense pour le moment"
          description="Parrainez vos proches : vous touchez une commission sur chaque commande payée de vos filleuls."
          action={
            <Button asChild className="bg-brand text-brand-foreground hover:brightness-95">
              <Link href="/account/referrals">Découvrir le parrainage</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Historique ({rewards.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Tableau desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Programme</th>
                    <th className="px-4 py-2.5 font-medium">Montant</th>
                    <th className="px-4 py-2.5 font-medium">Commande source</th>
                    <th className="px-4 py-2.5 font-medium">Statut</th>
                    <th className="px-4 py-2.5 font-medium">Disponibilité</th>
                  </tr>
                </thead>
                <tbody>
                  {rewards.map((reward) => (
                    <tr key={reward.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{PROGRAM_LABELS[reward.program] ?? reward.program}</p>
                        <p className="max-w-md text-xs text-muted-foreground">{reward.reason}</p>
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums">{formatXOF(reward.amount)}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/account/orders/${reward.sourceOrder.orderNumber}`}
                          className="font-mono text-xs font-semibold hover:underline"
                        >
                          {reward.sourceOrder.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <RewardStatusBadge status={reward.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {reward.status === "REWARD_PENDING" && reward.eligibleAt && (
                          <>Disponible le {dateFmt.format(reward.eligibleAt)}</>
                        )}
                        {reward.status === "REWARD_PENDING" && !reward.eligibleAt && <>Délai en cours</>}
                        {reward.status === "REWARD_AVAILABLE" && <>Sur votre portefeuille</>}
                        {reward.status === "REWARD_USED" && reward.usedAt && <>Utilisée le {dateFmt.format(reward.usedAt)}</>}
                        {reward.status === "REWARD_APPROVED" && <>Paiement manuel à venir</>}
                        {reward.status === "REWARD_PAID" && <>Versée manuellement</>}
                        {reward.status === "REWARD_CANCELLED" && (
                          <span className="text-destructive">{reward.cancelledReason ?? "Annulée"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Cartes mobile */}
            <ul className="divide-y md:hidden">
              {rewards.map((reward) => (
                <li key={reward.id} className="space-y-1.5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{PROGRAM_LABELS[reward.program] ?? reward.program}</p>
                    <p className="text-sm font-extrabold tabular-nums">{formatXOF(reward.amount)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{reward.reason}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/account/orders/${reward.sourceOrder.orderNumber}`}
                      className="font-mono text-xs font-semibold hover:underline"
                    >
                      {reward.sourceOrder.orderNumber}
                    </Link>
                    <RewardStatusBadge status={reward.status} />
                  </div>
                  {reward.status === "REWARD_PENDING" && reward.eligibleAt && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Info className="h-3 w-3" /> Disponible le {dateFmt.format(reward.eligibleAt)}
                    </p>
                  )}
                  {reward.status === "REWARD_USED" && reward.usedAt && (
                    <p className="text-xs text-muted-foreground">Utilisée le {dateFmt.format(reward.usedAt)}</p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
