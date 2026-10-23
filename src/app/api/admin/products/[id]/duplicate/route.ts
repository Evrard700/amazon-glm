import { db } from "@/lib/db"
import { ok, handle, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"

type Params = { params: Promise<{ id: string }> }

/** Duplication d'un produit (brouillon, ventes/avis remis à zéro). */
export async function POST(_request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    const { id } = await params
    const product = await db.product.findUnique({
      where: { id },
      include: { categories: true, collections: true, variants: true },
    })
    if (!product) throw new ApiError("Produit introuvable.", 404)

    const baseSlug = `${product.slug}-copie`.slice(0, 150).replace(/-+$/, "")
    let slug = baseSlug
    let suffix = 2
    while (await db.product.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`
    }

    const copy = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: `${product.name} (copie)`.slice(0, 160),
          slug,
          type: product.type,
          status: "DRAFT",
          description: product.description,
          shortDescription: product.shortDescription,
          price: product.price,
          salePrice: product.salePrice,
          sku: product.sku ? `${product.sku}-C${Date.now().toString(36).toUpperCase().slice(-3)}`.slice(0, 60) : null,
          stock: product.stock,
          trackInventory: product.trackInventory,
          imagesJson: product.imagesJson,
          tagsJson: product.tagsJson,
          attributesJson: product.attributesJson,
          relatedIdsJson: "[]",
          requiresShipping: product.requiresShipping,
          weightGrams: product.weightGrams,
          digitalFileName: product.digitalFileName,
          digitalFileUrl: product.digitalFileUrl,
          digitalDownloadLimit: product.digitalDownloadLimit,
          salesCount: 0,
          ratingAvg: 0,
          ratingCount: 0,
          viewsCount: 0,
        },
      })
      if (product.categories.length > 0) {
        await tx.productCategory.createMany({
          data: product.categories.map((c) => ({ productId: created.id, categoryId: c.categoryId })),
        })
      }
      if (product.collections.length > 0) {
        await tx.productCollection.createMany({
          data: product.collections.map((c) => ({ productId: created.id, collectionId: c.collectionId })),
        })
      }
      if (product.variants.length > 0) {
        await tx.productVariant.createMany({
          data: product.variants.map((v) => ({
            productId: created.id,
            name: v.name,
            optionsJson: v.optionsJson,
            sku: v.sku,
            price: v.price,
            stock: v.stock,
            imageUrl: v.imageUrl,
            isActive: v.isActive,
            position: v.position,
          })),
        })
      }
      return created
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "product.duplicate",
      entityType: "product",
      entityId: copy.id,
      details: { sourceId: id, sourceName: product.name, newSlug: slug },
    })

    invalidateCache("catalog")
    invalidateCache("product:")

    return ok({ id: copy.id, slug }, 201)
  })
}
