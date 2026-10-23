import { db } from "@/lib/db"
import { ok, handle } from "@/lib/api"
import { parseJson } from "@/lib/json"
import { computeCart } from "@/lib/services/cart"

/**
 * OFFRES UPSELL DANS LE PANIER (GET /api/cart/upsell-offers)
 * Retourne les UpsellOffer actives (`showInCart`) dont le déclencheur matche
 * les lignes du panier courant (produit / catégorie / montant) et dont le
 * produit proposé n'est pas déjà au panier.
 *
 * RÈGLE FINANCIÈRE (décision 2-b, documentée au worklog) : l'offre panier
 * n'applique JAMAIS le prix spécial — `computeCart` (serveur) ne connaît que
 * les prix catalogue. Le prix spécial `specialPrice` n'est appliqué QUE par le
 * moteur serveur d'upsell post-commande (page de remerciement). Le client ne
 * fait qu'ajouter le produit au prix normal ; l'UI affiche donc le prix
 * normal + un badge « Offre spéciale après commande ».
 */
export async function GET() {
  return handle(async () => {
    const cart = await computeCart()
    if (cart.lines.length === 0) return ok({ offers: [] })

    const now = new Date()
    const offers = await db.upsellOffer.findMany({
      where: {
        isActive: true,
        showInCart: true,
        AND: [
          // Fenêtre de validité : startsAt vide = déjà actif
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { position: "asc" },
      take: 4,
    })

    const cartProductIds = cart.lines.map((l) => l.product.id)
    const cartSubtotal = cart.subtotal

    // Produits du panier → catégories (pour le déclencheur CATEGORY)
    const links = cartProductIds.length
      ? await db.productCategory.findMany({ where: { productId: { in: cartProductIds } } })
      : []
    const cartCategoryIds = new Set(links.map((l) => l.categoryId))

    // Préchargement des produits proposés en UNE requête (anti-N+1) :
    // mêmes filtres que l'ancien findFirst par offre (ACTIVE + non supprimé)
    const offerProductIds = [...new Set(offers.map((o) => o.offerProductId))]
    const offerProducts = offerProductIds.length
      ? await db.product.findMany({ where: { id: { in: offerProductIds }, status: "ACTIVE", deletedAt: null } })
      : []
    const productById = new Map(offerProducts.map((p) => [p.id, p]))

    const results: {
      offerId: string
      name: string
      message: string
      imageUrl: string | null
      product: { id: string; name: string; slug: string; images: string[]; type: string; normalPrice: number }
      specialPrice: number
      savings: number
    }[] = []

    for (const offer of offers) {
      if (offer.maxAccepts !== null && offer.acceptedCount >= offer.maxAccepts) continue

      // Déclencheur
      if (offer.triggerType === "PRODUCT") {
        const triggerProducts = parseJson<string[]>(offer.triggerProductIdsJson, [])
        if (!cartProductIds.some((id) => triggerProducts.includes(id))) continue
      } else if (offer.triggerType === "CATEGORY") {
        const triggerCategories = parseJson<string[]>(offer.triggerCategoryIdsJson, [])
        if (!triggerCategories.some((id) => cartCategoryIds.has(id))) continue
      } else if (offer.triggerType === "ORDER_AMOUNT") {
        if (cartSubtotal < offer.triggerMinAmount) continue
      }

      const product = productById.get(offer.offerProductId)
      if (!product) continue
      if (product.type !== "DIGITAL" && product.trackInventory && product.stock < 1) continue
      // Produit déjà au panier → on ne le repropose pas
      if (cartProductIds.includes(product.id)) continue

      const normalPrice = product.salePrice ?? product.price
      results.push({
        offerId: offer.id,
        name: offer.name,
        message: offer.message,
        imageUrl: offer.imageUrl,
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          images: parseJson<string[]>(product.imagesJson, []),
          type: product.type,
          normalPrice,
        },
        specialPrice: offer.specialPrice,
        savings: Math.max(0, normalPrice - offer.specialPrice),
      })
    }

    return ok({ offers: results.slice(0, 3) })
  })
}
