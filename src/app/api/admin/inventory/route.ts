import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache, cached } from "@/lib/cache"
import { parseJson } from "@/lib/json"

/** Vue inventaire : produits physiques/hybrides suivis en stock (avec variantes). */
export async function GET() {
  return handle(async () => {
    await requireStaff("inventory.manage")
    const { settings, products } = await cached("admin:inventory", 15_000, async () => {
      const [settings, products] = await Promise.all([
        db.storeSettings.findUniqueOrThrow({ where: { id: 1 } }),
        db.product.findMany({
          where: {
            deletedAt: null,
            type: { in: ["PHYSICAL", "HYBRID"] },
            trackInventory: true,
          },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            slug: true,
            sku: true,
            type: true,
            status: true,
            stock: true,
            imagesJson: true,
            salesCount: true,
            variants: {
              orderBy: { position: "asc" },
              select: { id: true, name: true, sku: true, stock: true, isActive: true, optionsJson: true },
            },
          },
        }),
      ])
      return { settings, products }
    }, 180_000)

    return ok({
      lowStockThreshold: settings.lowStockThreshold,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        type: p.type,
        status: p.status,
        stock: p.stock,
        imagesJson: p.imagesJson,
        salesCount: p.salesCount,
        variants: p.variants.map((v) => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          stock: v.stock,
          isActive: v.isActive,
          options: parseJson<Record<string, string>>(v.optionsJson, {}),
        })),
      })),
    })
  })
}

const adjustSchema = z
  .object({
    productId: z.string().optional(),
    variantId: z.string().optional(),
    stock: z.number().int().min(0).max(1_000_000),
    reason: z.string().max(200).optional(),
  })
  .refine((d) => Boolean(d.productId) !== Boolean(d.variantId), {
    message: "Fournir productId OU variantId (exclusivement l'un des deux).",
  })

/** Ajustement manuel du stock — permission inventory.manage + journalisation. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("inventory.manage")
    const body = await parseBody(request, adjustSchema)

    let productName: string
    let variantName: string | null = null
    let previousStock: number

    if (body.variantId) {
      const variant = await db.productVariant.findUnique({ where: { id: body.variantId }, include: { product: true } })
      if (!variant) throw new ApiError("Variante introuvable.", 404)
      if (variant.product.type === "DIGITAL") throw new ApiError("Un produit numérique n'a pas de stock.", 409)
      productName = variant.product.name
      variantName = variant.name
      previousStock = variant.stock
      await db.productVariant.update({ where: { id: variant.id }, data: { stock: body.stock } })
    } else {
      const product = await db.product.findUnique({ where: { id: body.productId } })
      if (!product) throw new ApiError("Produit introuvable.", 404)
      if (product.type === "DIGITAL") throw new ApiError("Un produit numérique n'a pas de stock.", 409)
      if (!product.trackInventory) throw new ApiError("Le stock n'est pas suivi pour ce produit.", 409)
      productName = product.name
      previousStock = product.stock
      await db.product.update({ where: { id: product.id }, data: { stock: body.stock } })
    }

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "inventory.adjust",
      entityType: body.variantId ? "variant" : "product",
      entityId: body.variantId ?? body.productId,
      details: {
        product: productName,
        variant: variantName,
        from: previousStock,
        to: body.stock,
        delta: body.stock - previousStock,
        reason: body.reason ?? null,
      },
    })

    // Le stock affiché en boutique vient du cache catalogue
    invalidateCache("catalog")
    invalidateCache("product:")
    invalidateCache("admin:inventory")
    invalidateCache("admin:products")

    return ok({ stock: body.stock })
  })
}
