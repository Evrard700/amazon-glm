import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"

type Params = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(500).optional().nullable(),
  imageUrl: z.string().max(600).optional().nullable(),
  isFeatured: z.boolean().default(false),
  position: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
  productIds: z.array(z.string()).max(200).default([]),
})

/** Détail d'une collection avec ses produits (ids) pour le dialog d'édition. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireStaff("products.view")
    const { id } = await params
    const collection = await db.collection.findUnique({
      where: { id },
      include: { products: { select: { productId: true } } },
    })
    if (!collection) throw new ApiError("Collection introuvable.", 404)
    return ok({
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      description: collection.description,
      imageUrl: collection.imageUrl,
      isFeatured: collection.isFeatured,
      position: collection.position,
      isActive: collection.isActive,
      productIds: collection.products.map((p) => p.productId),
    })
  })
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    const { id } = await params
    const body = await parseBody(request, updateSchema)

    const collection = await db.collection.findUnique({ where: { id } })
    if (!collection) throw new ApiError("Collection introuvable.", 404)

    const slugConflict = await db.collection.findFirst({ where: { slug: body.slug, id: { not: id } } })
    if (slugConflict) throw new ApiError("Ce slug est déjà utilisé par une autre collection.", 409)
    if (body.productIds.length > 0) {
      const count = await db.product.count({ where: { id: { in: body.productIds }, deletedAt: null } })
      if (count !== body.productIds.length) throw new ApiError("Produit invalide dans la sélection.", 422)
    }

    await db.$transaction(async (tx) => {
      await tx.collection.update({
        where: { id },
        data: {
          name: body.name,
          slug: body.slug,
          description: body.description ?? null,
          imageUrl: body.imageUrl ?? null,
          isFeatured: body.isFeatured,
          position: body.position,
          isActive: body.isActive,
        },
      })
      await tx.productCollection.deleteMany({ where: { collectionId: id } })
      if (body.productIds.length > 0) {
        await tx.productCollection.createMany({
          data: body.productIds.map((productId) => ({ productId, collectionId: id })),
        })
      }
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "collection.update",
      entityType: "collection",
      entityId: id,
      details: { name: body.name, slug: body.slug, products: body.productIds.length },
    })

    invalidateCache("catalog") // purge "catalog" ET "catalog:collections"
    invalidateCache("admin:collections")

    return ok({ id })
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    const { id } = await params
    const collection = await db.collection.findUnique({ where: { id } })
    if (!collection) throw new ApiError("Collection introuvable.", 404)

    await db.collection.delete({ where: { id } })
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "collection.delete",
      entityType: "collection",
      entityId: id,
      details: { name: collection.name },
    })

    invalidateCache("catalog") // purge "catalog" ET "catalog:collections"
    invalidateCache("admin:collections")

    return ok({ id })
  })
}
