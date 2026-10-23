"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import {
  ArrowRight,
  Gift,
  Loader2,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TicketPercent,
  Trash2,
  Truck,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/storefront/empty-state"
import { useCartStore } from "@/lib/cart-store"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"

// computeCart signale le stock illimité par la sentinelle 999999 (produits
// numériques ou sans suivi de stock) — voir src/lib/services/cart.ts.
const UNLIMITED_STOCK = 999999

interface CartUpsellOffer {
  offerId: string
  name: string
  message: string
  imageUrl: string | null
  product: { id: string; name: string; slug: string; images: string[]; type: string; normalPrice: number }
  specialPrice: number
  savings: number
}

/**
 * PAGE PANIER COMPLÈTE — tous les montants proviennent du panier serveur
 * (GET/POST /api/cart recalculé par computeCart) ; le navigateur n'envoie
 * que des identifiants (produit, quantité), jamais de prix.
 */
export function CartPageView({ freeShippingThreshold }: { freeShippingThreshold: number }) {
  const store = useCartStore()
  const [initialLoading, setInitialLoading] = useState(true)
  const [couponInput, setCouponInput] = useState("")
  const [couponBusy, setCouponBusy] = useState(false)
  const [pendingItem, setPendingItem] = useState<string | null>(null)
  const [offers, setOffers] = useState<CartUpsellOffer[]>([])
  const [offersLoading, setOffersLoading] = useState(false)
  const [addingOffer, setAddingOffer] = useState<string | null>(null)

  useEffect(() => {
    store.fetchCart().finally(() => setInitialLoading(false))
  }, [])

  // Offres panier : recalculées à chaque changement de contenu du panier
  useEffect(() => {
    if (initialLoading) return
    if (store.lines.length === 0) {
      setOffers([])
      return
    }
    let cancelled = false
    setOffersLoading(true)
    ;(async () => {
      try {
        const res = await fetch("/api/cart/upsell-offers", { cache: "no-store" })
        const json = await res.json()
        if (!cancelled && json.ok) setOffers(json.data.offers as CartUpsellOffer[])
      } catch {
        /* silencieux */
      } finally {
        if (!cancelled) setOffersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store.lines.length, store.lines.map((l) => `${l.itemId}:${l.quantity}`).join("|"), initialLoading])

  const subtotalAfter = Math.max(0, store.subtotal - store.promotionDiscount - store.couponDiscount)
  const hasPhysical = store.lines.some((l) => l.product.type !== "DIGITAL")
  const freeShippingReached = freeShippingThreshold > 0 && subtotalAfter >= freeShippingThreshold
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - subtotalAfter)
  const isEmpty = store.lines.length === 0

  async function changeQty(itemId: string, quantity: number) {
    if (pendingItem) return
    setPendingItem(itemId)
    await store.updateItem(itemId, quantity)
    setPendingItem(null)
  }

  async function removeItem(itemId: string) {
    if (pendingItem) return
    setPendingItem(itemId)
    await store.removeItem(itemId)
    setPendingItem(null)
  }

  async function applyCoupon() {
    if (!couponInput.trim()) {
      toast.error("Saisissez un code promo.")
      return
    }
    setCouponBusy(true)
    const okApplied = await store.applyCoupon(couponInput)
    setCouponBusy(false)
    if (okApplied) setCouponInput("")
  }

  async function addOfferToCart(offer: CartUpsellOffer) {
    if (addingOffer) return
    setAddingOffer(offer.offerId)
    // Règle financière 2-b : l'offre panier ajoute le produit au PRIX NORMAL.
    // Le prix spécial n'est appliqué que par le moteur serveur post-commande
    // (page de remerciement) — voir worklog.
    const added = await store.addItem(offer.product.id, null, 1, {
      name: offer.product.name,
      slug: offer.product.slug,
      image: offer.product.images?.[0] ?? null,
      unitPrice: offer.product.normalPrice,
      type: offer.product.type,
    })
    setAddingOffer(null)
    if (added) {
      setOffers((prev) => prev.filter((o) => o.offerId !== offer.offerId))
    }
  }

  if (initialLoading) {
    return (
      <div aria-busy="true" aria-label="Chargement du panier">
        <Skeleton className="mb-6 h-8 w-56" />
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Mon panier</h1>
        </header>
        <EmptyState
          icon={ShoppingCart}
          title="Votre panier est vide"
          description="Parcourez le catalogue et ajoutez vos coups de cœur — les promotions « Achetez X, recevez Y » s'appliquent automatiquement."
          action={
            <Button asChild className="bg-brand text-brand-foreground hover:brightness-95">
              <Link href="/catalogue">Découvrir la boutique</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Mon panier</h1>
          <p className="text-sm text-muted-foreground">
            {store.itemCount} article{store.itemCount > 1 ? "s" : ""} — prix recalculés en direct par nos serveurs.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/catalogue">Continuer mes achats</Link>
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px] lg:gap-6">
        {/* ------- Colonne articles ------- */}
        <div className="space-y-4">
          {store.notes.length > 0 && (
            <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
              {store.notes.map((n, i) => (
                <p key={i} className="text-xs text-amber-800 dark:text-amber-300">
                  ⚠ {n.message}
                </p>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="divide-y p-0">
              {store.lines.map((line) => (
                <motion.div
                  layout
                  key={line.itemId}
                  className={cn("flex gap-3 p-4 sm:gap-4", line.pending && "animate-pulse opacity-70")}
                >
                  <Link
                    href={`/products/${line.product.slug}`}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-secondary/40"
                    aria-hidden
                  >
                    {line.product.images?.[0] && (
                      <Image src={line.product.images[0]} alt="" fill sizes="80px" className="object-cover" />
                    )}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/products/${line.product.slug}`} className="line-clamp-2 font-medium hover:underline">
                          {line.product.name}
                        </Link>
                        {line.variant && <p className="text-xs text-muted-foreground">{line.variant.name}</p>}
                        {line.pending && (
                          <p className="text-xs font-medium text-brand-foreground">Ajout en cours…</p>
                        )}
                      </div>
                      {!line.pending && (
                      <button
                        type="button"
                        onClick={() => removeItem(line.itemId)}
                        disabled={pendingItem === line.itemId}
                        aria-label={`Retirer ${line.product.name} du panier`}
                        className="rounded-md p-1.5 text-muted-foreground/70 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      >
                        {pendingItem === line.itemId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                      )}
                    </div>
                    {!line.pending && (
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center rounded-lg border bg-card">
                        <button
                          type="button"
                          onClick={() => changeQty(line.itemId, line.quantity - 1)}
                          disabled={pendingItem === line.itemId || line.quantity <= 1}
                          aria-label="Diminuer la quantité"
                          className="px-2.5 py-2 text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-9 text-center text-sm font-bold tabular-nums">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => changeQty(line.itemId, line.quantity + 1)}
                          disabled={pendingItem === line.itemId || (line.product.stock !== UNLIMITED_STOCK && line.quantity >= line.product.stock)}
                          aria-label="Augmenter la quantité"
                          className="px-2.5 py-2 text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatXOF(line.lineTotal)}</p>
                        <p className="text-xs text-muted-foreground">{formatXOF(line.unitPrice)} l&apos;unité</p>
                      </div>
                    </div>
                    )}
                    {!line.pending && line.product.stock !== UNLIMITED_STOCK && line.product.stock <= 5 && (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        Plus que {line.product.stock} en stock — dépêchez-vous !
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}

              {store.extraLines.map((extra, i) => (
                <div
                  key={`extra-${i}`}
                  className="flex items-center gap-3 border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/30"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                    <Gift className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-emerald-800 dark:text-emerald-300">{extra.productName}</p>
                    <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                      Offert{extra.message ? ` — ${extra.message}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">Offert</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {store.promotions.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
              <CardContent className="space-y-2 p-4">
                <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  <Sparkles className="h-4 w-4" /> Promotions appliquées à votre panier
                </p>
                {store.promotions.map((p, i) => (
                  <p key={i} className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
                    🎁 <span className="font-semibold">{p.name}</span> — {p.description}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ------- Offres pour vous (upsell panier) ------- */}
          {(offersLoading || offers.length > 0) && (
            <section aria-label="Offres pour vous" className="overflow-hidden rounded-xl border border-brand/50 bg-brand-soft/40">
              <div className="flex items-center gap-2 px-4 py-3">
                <Sparkles className="h-4 w-4 text-brand-foreground" />
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-brand-foreground">Offres pour vous</h2>
              </div>
              {offersLoading ? (
                <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
                  <Skeleton className="h-32 rounded-lg" />
                  <Skeleton className="h-32 rounded-lg" />
                </div>
              ) : (
                <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
                  {offers.map((offer) => (
                    <div key={offer.offerId} className="flex gap-3 rounded-lg border bg-card p-3">
                      <Link
                        href={`/products/${offer.product.slug}`}
                        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-secondary/40"
                        aria-hidden
                      >
                        {(offer.imageUrl ?? offer.product.images?.[0]) && (
                          <Image
                            src={(offer.imageUrl ?? offer.product.images[0]) as string}
                            alt=""
                            fill
                            sizes="80px"
                            className="object-cover"
                          />
                        )}
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="line-clamp-1 text-sm font-semibold">{offer.product.name}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{offer.message}</p>
                        <div className="mt-auto flex items-center justify-between gap-2">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold">{formatXOF(offer.product.normalPrice)}</span>
                          </div>
                          <Badge className="gap-1 bg-brand text-[10px] text-brand-foreground">
                            <Gift className="h-3 w-3" /> Offre spéciale après commande
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addOfferToCart(offer)}
                          disabled={addingOffer !== null}
                          className="mt-1 w-full gap-1.5 border-brand/60 font-semibold text-brand-foreground hover:bg-brand-soft sm:w-auto sm:self-end"
                        >
                          {addingOffer === offer.offerId ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ajout…
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" /> Ajouter au panier
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="border-t border-brand/30 bg-brand-soft/60 px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
                Astuce : ces produits vous seront reproposés à prix réduit juste après votre commande.
              </p>
            </section>
          )}
        </div>

        {/* ------- Résumé sticky ------- */}
        <div className="lg:sticky lg:top-24 lg:h-fit">
          <Card className="shadow-sm">
            <CardContent className="space-y-4 p-5">
              <h2 className="font-extrabold tracking-tight">Récapitulatif</h2>

              {/* Code promo */}
              {store.coupon ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/40">
                  <div className="flex items-center gap-2">
                    <TicketPercent className="h-4 w-4 text-emerald-600" />
                    <div>
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{store.coupon.code}</p>
                      <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">{store.coupon.description}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => store.removeCoupon()}
                    aria-label={`Retirer le code ${store.coupon?.code}`}
                    className="rounded-md p-1.5 text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <TicketPercent className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                      placeholder="CODE PROMO"
                      aria-label="Code promo"
                      className="h-10 pl-8 tracking-wide uppercase"
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={applyCoupon} disabled={couponBusy} className="h-10 gap-1.5">
                    {couponBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Appliquer
                  </Button>
                </div>
              )}

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Sous-total</span>
                  <span>{formatXOF(store.subtotal)}</span>
                </div>
                {store.promotionDiscount > 0 && (
                  <div className="flex justify-between font-medium text-emerald-600">
                    <span>Réductions (promotions)</span>
                    <span>-{formatXOF(store.promotionDiscount)}</span>
                  </div>
                )}
                {store.couponDiscount > 0 && (
                  <div className="flex justify-between font-medium text-emerald-600">
                    <span>Code {store.coupon?.code}</span>
                    <span>-{formatXOF(store.couponDiscount)}</span>
                  </div>
                )}
                {store.savings > 0 && (
                  <p className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                    🎉 Vous économisez {formatXOF(store.savings)} sur cette commande.
                  </p>
                )}
                <Separator />
                <div className="flex justify-between text-base font-extrabold">
                  <span>Total estimé</span>
                  <span>{formatXOF(subtotalAfter)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {hasPhysical
                    ? "Livraison calculée à l'étape suivante."
                    : "Produits numériques : aucune livraison requise."}
                </p>
              </div>

              {/* Seuil livraison offerte */}
              {freeShippingThreshold > 0 && hasPhysical && (
                <div className="space-y-2 rounded-lg border bg-brand-soft/50 px-3 py-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-brand-foreground">
                    <Truck className="h-4 w-4" />
                    {freeShippingReached ? (
                      <span>Livraison offerte débloquée !</span>
                    ) : (
                      <span>Plus que {formatXOF(remainingForFreeShipping)} pour la livraison offerte</span>
                    )}
                  </div>
                  <Progress
                    value={Math.min(100, Math.round((subtotalAfter / freeShippingThreshold) * 100))}
                    className="h-1.5 bg-background"
                    aria-label={`Progression vers la livraison offerte (${formatXOF(subtotalAfter)} / ${formatXOF(freeShippingThreshold)})`}
                  />
                </div>
              )}

              <Button
                asChild
                size="lg"
                className="w-full gap-2 bg-brand text-lg font-extrabold text-brand-foreground shadow-md hover:brightness-95"
              >
                <Link href="/checkout">
                  Passer la commande <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>

              <Button asChild variant="outline" size="sm" className="w-full text-muted-foreground">
                <Link href="/catalogue">Continuer mes achats</Link>
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Paiement à la livraison disponible — prix en FCFA.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
