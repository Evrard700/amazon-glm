"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Minus, Plus, ShoppingBag, Trash2, X, TicketPercent, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useCartStore } from "@/lib/cart-store"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"

export function CartDrawer() {
  const store = useCartStore()
  const [couponInput, setCouponInput] = useState("")

  const subtotalAfter = Math.max(0, store.subtotal - store.promotionDiscount - store.couponDiscount)

  // CSS pur (remplace AnimatePresence + motion) : entrées animées par les
  // keyframes slide-in-right / fade-in de globals.css ; fermeture instantanée
  // (choix assumé — l'ancien exit framer est abandonné pour rester simple).
  return (
    <>
      {store.drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-50 animate-[fade-in_0.25s_ease-out] bg-foreground/40 backdrop-blur-sm"
            onClick={store.closeDrawer}
            aria-hidden
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col animate-[slide-in-right_0.28s_cubic-bezier(0.32,0.72,0,1)] bg-background shadow-2xl"
            role="dialog"
            aria-label="Panier"
          >
            <header className="flex items-center justify-between border-b px-4 py-3.5">
              <div className="flex items-center gap-2 font-semibold">
                <ShoppingBag className="h-5 w-5 text-brand-foreground" />
                Votre panier
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand-foreground">
                  {store.itemCount}
                </span>
              </div>
              <Button variant="ghost" size="icon" onClick={store.closeDrawer} aria-label="Fermer le panier">
                <X className="h-5 w-5" />
              </Button>
            </header>

            {store.notes.length > 0 && (
              <div className="space-y-1 border-b bg-brand-soft/60 px-4 py-2">
                {store.notes.map((n, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    ⚠ {n.message}
                  </p>
                ))}
              </div>
            )}

            <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-3">
              {store.lines.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <ShoppingBag className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.2} />
                  <p className="text-sm text-muted-foreground">Votre panier est vide.</p>
                  <Button asChild onClick={store.closeDrawer} className="bg-brand text-brand-foreground hover:brightness-95">
                    <Link href="/catalogue">Découvrir la boutique</Link>
                  </Button>
                </div>
              ) : (
                <ul className="space-y-3">
                  {store.lines.map((line) => (
                    <li
                      key={line.itemId}
                      className={cn(
                        "flex gap-3 rounded-lg border bg-card p-2.5 transition-opacity",
                        line.pending && "animate-pulse border-brand/40 opacity-70",
                      )}
                    >
                      <Link
                        href={`/products/${line.product.slug}`}
                        onClick={store.closeDrawer}
                        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-secondary/40"
                      >
                        {line.product.images?.[0] && (
                          <Image src={line.product.images[0]} alt={line.product.name} fill sizes="64px" className="object-cover" />
                        )}
                      </Link>
                      <div className="flex flex-1 flex-col gap-1">
                        <Link
                          href={`/products/${line.product.slug}`}
                          onClick={store.closeDrawer}
                          className="line-clamp-1 text-sm font-medium hover:underline"
                        >
                          {line.product.name}
                        </Link>
                        {line.variant && <p className="text-xs text-muted-foreground">{line.variant.name}</p>}
                        {line.pending ? (
                          <p className="text-xs font-medium text-brand-foreground">Ajout en cours…</p>
                        ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center rounded-md border">
                            <button
                              className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                              disabled={line.quantity <= 1}
                              onClick={() => store.updateItem(line.itemId, line.quantity - 1)}
                              aria-label="Diminuer la quantité"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-8 text-center text-sm font-semibold">{line.quantity}</span>
                            <button
                              className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                              disabled={line.product.trackInventory && line.quantity >= line.product.stock}
                              onClick={() => store.updateItem(line.itemId, line.quantity + 1)}
                              aria-label="Augmenter la quantité"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <span className="text-sm font-bold">{formatXOF(line.lineTotal)}</span>
                        </div>
                        )}
                      </div>
                      {!line.pending && (
                      <button
                        className="self-start p-1 text-muted-foreground/60 transition hover:text-destructive"
                        onClick={() => store.removeItem(line.itemId)}
                        aria-label="Retirer l'article"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      )}
                    </li>
                  ))}

                  {store.extraLines.map((extra, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-lg border border-dashed border-brand/50 bg-brand-soft/40 p-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand text-brand-foreground">
                        <ShoppingBag className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{extra.productName}</p>
                        <p className="text-xs text-muted-foreground">{extra.message}</p>
                      </div>
                      <span className="text-sm font-bold text-brand-foreground">Offert</span>
                    </li>
                  ))}

                  {store.promotions.length > 0 && (
                    <li className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 dark:bg-emerald-950/40 dark:border-emerald-900">
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Promotions appliquées</p>
                      {store.promotions.map((p, i) => (
                        <p key={i} className="text-xs text-emerald-700/90 dark:text-emerald-300">
                          🎁 {p.description}
                        </p>
                      ))}
                    </li>
                  )}
                </ul>
              )}
            </div>

            {store.lines.length > 0 && (
              <footer className="space-y-3 border-t bg-card px-4 py-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <TicketPercent className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="CODE PROMO"
                      className="h-9 pl-8 tracking-wide"
                      aria-label="Code promo"
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="h-9"
                    onClick={async () => {
                      if (await store.applyCoupon(couponInput)) setCouponInput("")
                    }}
                  >
                    Appliquer
                  </Button>
                </div>

                <Separator />

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Sous-total</span>
                    <span>{formatXOF(store.subtotal)}</span>
                  </div>
                  {store.promotionDiscount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Promotions</span>
                      <span>-{formatXOF(store.promotionDiscount)}</span>
                    </div>
                  )}
                  {store.couponDiscount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Code {store.coupon?.code}</span>
                      <span>-{formatXOF(store.couponDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 text-base font-bold">
                    <span>Total estimé</span>
                    <span>{formatXOF(subtotalAfter)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Livraison calculée à l'étape suivante.</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline" onClick={store.closeDrawer}>
                    <Link href="/cart">Voir le panier</Link>
                  </Button>
                  <Button asChild className="bg-brand text-brand-foreground hover:brightness-95">
                    <Link href="/checkout" onClick={store.closeDrawer}>
                      Commander <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </footer>
            )}
          </aside>
        </>
      )}
    </>
  )
}
