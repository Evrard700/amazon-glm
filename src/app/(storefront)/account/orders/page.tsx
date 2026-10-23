import Link from "next/link"
import { Package, PackageSearch } from "lucide-react"
import { db } from "@/lib/db"
import { requireUserPage } from "@/components/storefront/account-guard"
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/storefront/status-badge"
import { EmptyState } from "@/components/storefront/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"

export const metadata = { title: "Mes commandes" }

const IN_PROGRESS = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED"]

const FILTERS = [
  { key: "toutes", label: "Toutes" },
  { key: "en-cours", label: "En cours" },
  { key: "livrees", label: "Livrées" },
] as const

type FilterKey = (typeof FILTERS)[number]["key"]

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })

export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string }>
}) {
  const user = await requireUserPage("/account/orders")
  const { filtre } = await searchParams
  const filter: FilterKey = FILTERS.some((f) => f.key === filtre) ? (filtre as FilterKey) : "toutes"

  const orders = await db.order.findMany({
    where: {
      userId: user.id,
      ...(filter === "en-cours" ? { orderStatus: { in: IN_PROGRESS } } : {}),
      ...(filter === "livrees" ? { orderStatus: "DELIVERED" } : {}),
    },
    orderBy: { createdAt: "desc" },
    // Compteur en sous-requête (anti-overfetching) : plus de chargement
    // complet des lignes juste pour dénombrer les articles
    include: { _count: { select: { items: true } } },
  })

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Mes commandes</h1>
          <p className="text-sm text-muted-foreground">Suivez chaque commande, de la préparation à la livraison.</p>
        </div>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href="/catalogue">
            <Package className="h-4 w-4" /> Commander à nouveau
          </Link>
        </Button>
      </header>

      {/* Filtres simples */}
      <nav aria-label="Filtres de commandes" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "toutes" ? "/account/orders" : `/account/orders?filtre=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={filter === "toutes" ? "Aucune commande pour le moment" : `Aucune commande ${filter === "en-cours" ? "en cours" : "livrée"}`}
          description={
            filter === "toutes"
              ? "Vos futures commandes apparaîtront ici avec leur suivi détaillé."
              : "Essayez un autre filtre ou passez une nouvelle commande."
          }
          action={
            <Button asChild className="bg-brand text-brand-foreground hover:brightness-95">
              <Link href="/catalogue">Découvrir la boutique</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const itemCount = order._count.items
            return (
              <li key={order.id}>
                <Link href={`/account/orders/${order.orderNumber}`} className="block rounded-xl transition hover:opacity-95">
                  <Card className="shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold tracking-wide">{order.orderNumber}</span>
                          {order.upsellParentOrderId && (
                            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand-foreground">
                              Offre complémentaire
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {dateFmt.format(order.createdAt)} — {itemCount} article{itemCount > 1 ? "s" : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <OrderStatusBadge status={order.orderStatus} />
                          <PaymentStatusBadge status={order.paymentStatus} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-extrabold">{formatXOF(order.total)}</p>
                        <p className="text-xs font-semibold text-brand-foreground underline underline-offset-2">
                          Voir le détail
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
