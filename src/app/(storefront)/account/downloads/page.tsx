import { db } from "@/lib/db"
import { requireUserPage } from "@/components/storefront/account-guard"
import { DownloadButton } from "@/components/storefront/download-button"
import { EmptyState } from "@/components/storefront/empty-state"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, FileArchive, Lock } from "lucide-react"
import Link from "next/link"

export const metadata = { title: "Mes téléchargements" }

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" })

/** Espace téléchargements numériques — accès liés au compte (grants serveur). */
export default async function AccountDownloadsPage() {
  const user = await requireUserPage("/account/downloads")

  const grants = await db.digitalDownloadGrant.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { orderItem: { include: { order: true, product: true } } },
  })

  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Mes téléchargements</h1>
        <p className="text-sm text-muted-foreground">
          Vos fichiers numériques, disponibles dès que le paiement de la commande est confirmé.
        </p>
      </header>

      {grants.length === 0 ? (
        <EmptyState
          icon={FileArchive}
          title="Aucun fichier pour le moment"
          description="Vos achats de produits numériques (ebooks, masterclass, templates…) apparaîtront ici après confirmation du paiement."
          action={
            <Button asChild className="bg-brand text-brand-foreground hover:brightness-95">
              <Link href="/catalogue">Voir les produits numériques</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {grants.map((grant) => {
            const order = grant.orderItem.order
            const remaining = Math.max(0, grant.limitCount - grant.downloadCount)
            const exhausted = grant.downloadCount >= grant.limitCount
            return (
              <li key={grant.id}>
                <Card className={grant.revoked ? "border-rose-200 dark:border-rose-900" : ""}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
                        <FileArchive className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{grant.orderItem.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          Commande{" "}
                          <Link href={`/account/orders/${order.orderNumber}`} className="font-mono font-semibold hover:underline">
                            {order.orderNumber}
                          </Link>{" "}
                          — acheté le {dateFmt.format(grant.createdAt)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {grant.revoked ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400">
                              <Lock className="h-3 w-3" /> Accès révoqué{grant.revokedReason ? ` : ${grant.revokedReason}` : ""}
                            </span>
                          ) : (
                            <Badge variant="secondary" className="text-[11px]">
                              <Download className="mr-1 h-3 w-3" /> {grant.downloadCount}/{grant.limitCount} utilisés
                            </Badge>
                          )}
                          {grant.orderItem.product.digitalFileName && (
                            <span className="text-[11px] text-muted-foreground">{grant.orderItem.product.digitalFileName}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {grant.revoked ? (
                      <Badge variant="destructive">Indisponible</Badge>
                    ) : exhausted ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Limite atteinte
                      </Badge>
                    ) : (
                      <DownloadButton grantId={grant.id} label={`Télécharger (${remaining} restant${remaining > 1 ? "s" : ""})`} />
                    )}
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
