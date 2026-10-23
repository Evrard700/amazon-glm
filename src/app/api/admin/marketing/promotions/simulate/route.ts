import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { parseJson } from "@/lib/json"
import { invalidateCache } from "@/lib/cache"
import { applyPromotions } from "@/lib/services/promotions"
import type { CartLine } from "@/lib/services/cart-types"

/**
 * POST /api/admin/marketing/promotions/simulate
 * Simulateur fidèle au moteur réel : reconstruit des lignes de panier depuis
 * les PRIX DE LA BASE (jamais depuis le client), puis appelle directement
 * `applyPromotions` (le même code que le checkout, userId null = invité).
 * Corps : { lines: [{ productId, qty }] }
 */

const schema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().min(1, "Produit requis."),
        qty: z.coerce.number().int().min(1, "Quantité ≥ 1.").max(99),
      }),
    )
    .min(1, "Ajoutez au moins une ligne au panier simulé.")
    .max(30),
})

export async function POST(request: Request) {
  return handle(async () => {
    await requireStaff("promotions.manage")
    const body = await parseBody(request, schema)

    const lines: CartLine[] = []
    for (const l of body.lines) {
      const product = await db.product.findFirst({
        where: { id: l.productId, deletedAt: null, status: "ACTIVE" },
      })
      if (!product) {
        throw new ApiError("Un des produits simulés est introuvable ou non publié.", 404)
      }
      const unitPrice = product.salePrice ?? product.price
      lines.push({
        itemId: `sim-${l.productId}`,
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          type: product.type,
          price: product.price,
          salePrice: product.salePrice,
          stock: product.trackInventory ? product.stock : 999999,
          trackInventory: product.trackInventory,
          status: product.status,
          sku: product.sku,
          images: parseJson<string[]>(product.imagesJson, []),
          requiresShipping: product.requiresShipping,
          digitalFileName: product.digitalFileName,
        },
        variant: null,
        quantity: l.qty,
        unitPrice,
        lineTotal: unitPrice * l.qty,
      })
    }

    // Moteur réel — userId null : simulation invité (aucun historique client)
    const applications = await applyPromotions(lines, null)

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)
    const discount = applications.reduce((s, a) => s + a.amount, 0)

    // La simulation vient de manipuler le cache des promotions actives via
    // le moteur : on rafraîchit pour la prochaine lecture panier.
    invalidateCache("promotions:")

    return ok({
      simulatedLines: lines.map((l) => ({
        productId: l.product.id,
        name: l.product.name,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
      })),
      subtotal,
      discount,
      totalAfter: subtotal - discount,
      applications,
    })
  })
}
