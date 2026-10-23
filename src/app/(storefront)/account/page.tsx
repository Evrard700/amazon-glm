import { db } from "@/lib/db"
import { requireUserPage } from "@/components/storefront/account-guard"
import { ProfileForm } from "@/components/storefront/profile-form"
import { LogoutButton } from "@/components/storefront/account-nav"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatXOF } from "@/lib/money"

export const metadata = { title: "Mon profil" }

const CREDIT_TYPE_LABELS: Record<string, string> = {
  REWARD: "Récompense parrainage",
  REFUND: "Remboursement",
  ADMIN_ADJUSTMENT: "Ajustement (équipe)",
  SPEND: "Dépense sur commande",
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

export default async function AccountProfilePage() {
  const user = await requireUserPage("/account")
  const transactions = await db.creditTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Mon profil</h1>
        <p className="text-sm text-muted-foreground">Vos informations de livraison et votre portefeuille boutique.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Informations personnelles</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm
              initial={{
                name: user.name,
                email: user.email,
                phone: user.phone ?? "",
                address: user.address ?? "",
                city: user.city ?? "",
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                Crédit boutique
                <span className="rounded-full bg-emerald-600 px-3 py-1 text-lg font-extrabold text-white">
                  {formatXOF(user.storeCredit)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Utilisable directement lors du paiement de vos commandes. Alimenté par vos récompenses de parrainage
                (voir <a href="/account/rewards" className="font-semibold underline underline-offset-2">Mes récompenses</a>).
              </p>
              {transactions.length > 0 ? (
                <ul className="scrollbar-thin mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {transactions.map((tx) => (
                    <li key={tx.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{CREDIT_TYPE_LABELS[tx.type] ?? tx.type}</p>
                        <p className="truncate text-[11px] text-muted-foreground" title={tx.description}>
                          {tx.description}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-bold ${tx.amount >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {tx.amount >= 0 ? "+" : ""}
                          {formatXOF(tx.amount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{dateFmt.format(tx.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Aucun mouvement pour l&apos;instant — <a href="/account/referrals" className="font-semibold underline underline-offset-2">parrainez vos proches</a> pour garnir votre portefeuille.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-semibold">Votre code de parrainage</p>
                <Badge className="mt-1 bg-brand font-mono text-sm tracking-wider text-brand-foreground">{user.referralCode}</Badge>
              </div>
              <LogoutButton />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
