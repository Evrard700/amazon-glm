"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Gift, Loader2, PartyPopper, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"

interface UpsellOfferData {
  offerId: string
  name: string
  message: string
  imageUrl: string | null
  product: { id: string; name: string; slug: string; images: string[]; type: string }
  normalPrice: number
  specialPrice: number
  savings: number
  endsAt: string | null
}

/**
 * OFFRES POST-COMMANDE (page de remerciement) — le cœur marketing.
 * Le prix spécial est appliqué PAR LE SERVEUR (POST /api/checkout/upsell crée
 * une commande complémentaire liée, idempotente). Aucun prix n'est calculé
 * côté navigateur : les valeurs affichées viennent du moteur d'upsell.
 *
 * `token` = jeton d'accès invité de la commande — preuve de propriété exigée
 * par l'API pour les commandes non connectées (anti-IDOR).
 */
export function ThankYouUpsells({ orderId, token }: { orderId: string; token?: string }) {
  const router = useRouter()
  const [offers, setOffers] = useState<UpsellOfferData[] | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/checkout/upsell?orderId=${encodeURIComponent(orderId)}${token ? `&token=${encodeURIComponent(token)}` : ""}`,
          { cache: "no-store" },
        )
        const json = await res.json()
        if (!cancelled && json.ok) setOffers(json.data.offers as UpsellOfferData[])
      } catch {
        if (!cancelled) setOffers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orderId])

  if (offers === null || offers.length === 0 || dismissed) return null

  async function accept(offer: UpsellOfferData) {
    if (accepting) return // anti double-clic
    setAccepting(offer.offerId)
    try {
      const res = await fetch("/api/checkout/upsell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: offer.offerId, orderId, accessToken: token }),
      })
      const json = await res.json()
      if (!json.ok) {
        toast.error(json.error ?? "Cette offre n'est plus disponible.")
        setAccepting(null)
        return
      }
      const { orderNumber } = json.data as { orderNumber: string }
      toast.success(`Ajouté à votre commande : ${orderNumber}`, {
        description: `${offer.product.name} à ${formatXOF(offer.specialPrice)} — réglez-le avec votre livraison initiale.`,
      })
      // Recharge la page : la commande complémentaire apparaît dans « Commandes liées »
      router.refresh()
      setOffers((prev) => (prev ? prev.filter((o) => o.offerId !== offer.offerId) : prev))
      setAccepting(null)
    } catch {
      toast.error("Erreur réseau. Réessayez.")
      setAccepting(null)
    }
  }

  return (
    // CSS pur : apparition fondu + montée (keyframe slide-up de globals.css),
    // calque l'ancien motion.section (opacity 0, y 10 → 0.3 s).
    <section
      aria-label="Offres exclusives réservées à votre commande"
      className="overflow-hidden rounded-xl border border-brand/60 bg-gradient-to-b from-brand-soft/80 to-card shadow-sm animate-[slide-up_0.3s_ease-out]"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-brand/30 px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-brand-foreground">
          <PartyPopper className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-extrabold tracking-tight">Une offre exclusive pour votre commande</h2>
          <p className="text-xs text-muted-foreground">Réservée aux clients qui viennent de commander — à prix réduit.</p>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {offers.map((offer) => (
          <Card key={offer.offerId} className="overflow-hidden border-brand/30 shadow-none">
            <div className="relative aspect-[4/3] bg-secondary/40">
              {(offer.imageUrl ?? offer.product.images?.[0]) && (
                <Image
                  src={(offer.imageUrl ?? offer.product.images[0]) as string}
                  alt={offer.product.name}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover"
                />
              )}
              <Badge className="absolute left-2 top-2 gap-1 bg-brand text-brand-foreground">
                <Sparkles className="h-3 w-3" /> -{formatXOF(offer.savings)}
              </Badge>
            </div>
            <CardContent className="space-y-2 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-foreground">{offer.name}</p>
              <p className="line-clamp-1 text-sm font-bold">{offer.product.name}</p>
              <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{offer.message}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-extrabold text-brand-foreground">{formatXOF(offer.specialPrice)}</span>
                <span className="text-sm text-muted-foreground line-through">{formatXOF(offer.normalPrice)}</span>
              </div>
              <Button
                onClick={() => accept(offer)}
                disabled={accepting !== null}
                className={cn("w-full gap-1.5 bg-brand font-semibold text-brand-foreground hover:brightness-95")}
                size="sm"
              >
                {accepting === offer.offerId ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Ajout en cours…
                  </>
                ) : (
                  <>
                    <Gift className="h-4 w-4" /> Profiter de l&apos;offre
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3 px-5 pb-4">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Non merci, je passe
        </button>
      </div>
    </section>
  )
}
