import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache, cached } from "@/lib/cache"

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const createSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().max(80).regex(slugRegex),
  description: z.string().max(500).optional().nullable(),
  imageUrl: z.string().max(600).optional().nullable(),
  isFeatured: z.boolean().default(false),
  position: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
  productIds: z.array(z.string()).max(200).default([]),
})

/** Liste des collections avec leur produit (pour le formulaire et la page admin). */
export async function GET() {
  return handle(async () => {
    await requireStaff("products.view")
    const collections = await cached(
      "admin:collections",
      15_000,
      () =>
        db.collection.findMany({
          orderBy: [{ position: "asc" }, { name: "asc" }],
          include: { _count: { select: { products: true } } },
        }),
      180_000,
    )
    return ok(
      collections.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        imageUrl: c.imageUrl,
        isFeatured: c.isFeatured,
        position: c.position,
        isActive: c.isActive,
        productsCount: c._count.products,
        createdAt: c.createdAt,
      })),
    )
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    const body = await parseBody(request, createSchema)

    if (await db.collection.findUnique({ where: { slug: body.slug } })) {
      throw new ApiError("Ce slug est déjà utilisé par une autre collection.", 409)
    }
    if (body.productIds.length > 0) {
      const count = await db.product.count({ where: { id: { in: body.productIds }, deletedAt: null } })
      if (count !== body.productIds.length) throw new ApiError("Produit invalide dans la sélection.", 422)
    }

    const collection = await db.$transaction(async (tx) => {
      const created = await tx.collection.create({
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
      if (body.productIds.length > 0) {
        await tx.productCollection.createMany({
          data: body.productIds.map((productId) => ({ productId, collectionId: created.id })),
        })
      }
      return created
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "collection.create",
      entityType: "collection",
      entityId: collection.id,
      details: { name: collection.name, slug: collection.slug, products: body.productIds.length },
    })

    invalidateCache("catalog") // purge "catalog" ET "catalog:collections"
    invalidateCache("admin:collections")

    return ok({ id: collection.id }, 201)
  })
}
