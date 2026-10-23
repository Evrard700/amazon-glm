import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { parseJson } from "@/lib/json"
import { cached } from "@/lib/cache"
import { getSettings } from "@/lib/catalog-data"
import { CheckoutForm } from "@/components/storefront/checkout-form"

export const metadata = { title: "Finaliser ma commande" }

export default async function CheckoutPage() {
  // Zones + méthodes de paiement + réglages via caches mémoire (30 s) —
  // les trois lectures partent en parallèle, à chaud c'est zéro requête DB.
  const [zones, methods, settings, user] = await Promise.all([
    cached("zones", 30_000, () =>
      db.shippingZone.findMany({ where: { isActive: true }, orderBy: { position: "asc" } }),
    ),
    cached("payment-methods", 30_000, () =>
      db.paymentMethod.findMany({ orderBy: { position: "asc" } }),
    ),
    getSettings(),
    getSessionUser(),
  ])

  // Un moyen de paiement en ligne n'est sélectionnable que s'il est actif ET
  // réellement configuré (clés serveur présentes) — honnêteté : aucun simulation.
  const methodDtos = methods.map((m) => {
    const config = parseJson<Record<string, string>>(m.configJson, {})
    const hasKeys = Object.values(config).some((v) => v && String(v).length > 3)
    return {
      code: m.code,
      name: m.name,
      description: m.description,
      instructions: m.instructions,
      isOnline: m.isOnline,
      enabled: m.isActive && (!m.isOnline || hasKeys),
      needsConfig: m.isOnline && !hasKeys,
    }
  })

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:py-8">
      <CheckoutForm
        zones={zones.map((z) => ({
          id: z.id,
          name: z.name,
          baseCost: z.baseCost,
          estimatedDaysMin: z.estimatedDaysMin,
          estimatedDaysMax: z.estimatedDaysMax,
        }))}
        methods={methodDtos}
        guestCheckoutEnabled={settings.guestCheckoutEnabled}
        freeShippingThreshold={settings.freeShippingThreshold}
        user={
          user
            ? {
                name: user.name,
                email: user.email,
                phone: user.phone,
                address: user.address,
                city: user.city,
                storeCredit: user.storeCredit,
              }
            : null
        }
      />
    </div>
  )
}
