import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"
import { parseJson } from "@/lib/json"
import { productSchema, productPatchSchema } from "../schema"

type Params = { params: Promise<{ id: string }> }

/** Détail complet d'un produit (toutes relations sérialisées pour le formulaire). */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireStaff("products.view")
    const { id } = await params
    const p = await db.product.findUnique({
      where: { id },
      include: {
        categories: true,
        collections: true,
        variants: { orderBy: { position: "asc" } },
        _count: { select: { orderItems: true } },
      },
    })
    if (!p) throw new ApiError("Produit introuvable.", 404)

    return ok({
      id: p.id,
      name: p.name,
      slug: p.slug,
      type: p.type,
      status: p.status,
      description: p.description,
      shortDescription: p.shortDescription ?? "",
      price: p.price,
      salePrice: p.salePrice,
      sku: p.sku ?? "",
      stock: p.stock,
      trackInventory: p.trackInventory,
      images: parseJson<string[]>(p.imagesJson, []),
      tags: parseJson<string[]>(p.tagsJson, []),
      attributes: parseJson<{ name: string; values: string[] }[]>(p.attributesJson, []),
      relatedIds: parseJson<string[]>(p.relatedIdsJson, []),
      requiresShipping: p.requiresShipping,
      weightGrams: p.weightGrams,
      digitalFileName: p.digitalFileName,
      digitalFileUrl: p.digitalFileUrl,
      digitalDownloadLimit: p.digitalDownloadLimit,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      salesCount: p.salesCount,
      deletedAt: p.deletedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      categoryIds: p.categories.map((c) => c.categoryId),
      collectionIds: p.collections.map((c) => c.collectionId),
      variants: p.variants.map((v) => ({
        id: v.id,
        name: v.name,
        options: parseJson<Record<string, string>>(v.optionsJson, {}),
        sku: v.sku,
        price: v.price,
        stock: v.stock,
        imageUrl: v.imageUrl,
        isActive: v.isActive,
        position: v.position,
      })),
      orderItemsCount: p._count.orderItems,
    })
  })
}

/** Mise à jour complète (PUT) — relations remplacées en transaction. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    const { id } = await params
    const body = await parseBody(request, productSchema)

    const product = await db.product.findUnique({ where: { id } })
    if (!product) throw new ApiError("Produit introuvable.", 404)

    const slugConflict = await db.product.findFirst({ where: { slug: body.slug, id: { not: id } } })
    if (slugConflict) throw new ApiError("Ce slug est déjà utilisé par un autre produit.", 409)

    if (body.categoryIds.length > 0) {
      const count = await db.category.count({ where: { id: { in: body.categoryIds } } })
      if (count !== body.categoryIds.length) throw new ApiError("Catégorie invalide.", 422)
    }
    if (body.collectionIds.length > 0) {
      const count = await db.collection.count({ where: { id: { in: body.collectionIds } } })
      if (count !== body.collectionIds.length) throw new ApiError("Collection invalide.", 422)
    }

    await db.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: body.name,
          slug: body.slug,
          type: body.type,
          status: body.status,
          description: body.description,
          shortDescription: body.shortDescription ?? null,
          price: body.price,
          salePrice: body.salePrice ?? null,
          sku: body.sku ?? null,
          stock: body.type === "DIGITAL" ? 0 : body.stock,
          trackInventory: body.type === "DIGITAL" ? false : body.trackInventory,
          imagesJson: JSON.stringify(body.images),
          tagsJson: JSON.stringify(body.tags),
          attributesJson: JSON.stringify(body.attributes),
          relatedIdsJson: JSON.stringify(body.relatedIds),
          requiresShipping: body.type === "DIGITAL" ? false : body.requiresShipping,
          weightGrams: body.weightGrams ?? null,
          digitalFileName: body.type === "PHYSICAL" ? null : (body.digitalFileName ?? null),
          digitalFileUrl: body.type === "PHYSICAL" ? null : (body.digitalFileUrl ?? null),
          digitalDownloadLimit: body.digitalDownloadLimit,
        },
      })

      // Relations : remplacement intégral (deleteMany + createMany)
      await tx.productCategory.deleteMany({ where: { productId: id } })
      if (body.categoryIds.length > 0) {
        await tx.productCategory.createMany({ data: body.categoryIds.map((categoryId) => ({ productId: id, categoryId })) })
      }
      await tx.productCollection.deleteMany({ where: { productId: id } })
      if (body.collectionIds.length > 0) {
        await tx.productCollection.createMany({ data: body.collectionIds.map((collectionId) => ({ productId: id, collectionId })) })
      }

      // Variantes : diff par id — mise à jour, création, suppression des disparues
      const existingVariants = await tx.productVariant.findMany({ where: { productId: id }, select: { id: true } })
      const existingIds = new Set(existingVariants.map((v) => v.id))
      const keptIds = new Set(body.variants.filter((v) => v.id).map((v) => v.id as string))

      for (const v of body.variants) {
        if (v.id && existingIds.has(v.id)) {
          await tx.productVariant.update({
            where: { id: v.id },
            data: {
              name: v.name,
              optionsJson: JSON.stringify(v.options),
              sku: v.sku ?? null,
              price: v.price ?? null,
              stock: v.stock,
              imageUrl: v.imageUrl ?? null,
              isActive: v.isActive,
              position: v.position,
            },
          })
        } else {
          await tx.productVariant.create({
            data: {
              productId: id,
              name: v.name,
              optionsJson: JSON.stringify(v.options),
              sku: v.sku ?? null,
              price: v.price ?? null,
              stock: v.stock,
              imageUrl: v.imageUrl ?? null,
              isActive: v.isActive,
              position: v.position,
            },
          })
        }
      }
      const toDelete = [...existingIds].filter((vid) => !keptIds.has(vid))
      if (toDelete.length > 0) {
        await tx.productVariant.deleteMany({ where: { id: { in: toDelete } } })
      }
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "product.update",
      entityType: "product",
      entityId: id,
      details: { name: body.name, status: body.status, price: body.price },
    })

    invalidateCache("catalog")
    invalidateCache("product:")
    invalidateCache("admin:products")
    invalidateCache("admin:inventory")

    return ok({ id })
  })
}

/** Changement rapide de statut (publier / dépublier / archiver). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    const { id } = await params
    const body = await parseBody(request, productPatchSchema)

    const product = await db.product.findUnique({ where: { id } })
    if (!product) throw new ApiError("Produit introuvable.", 404)
    if (product.deletedAt) throw new ApiError("Ce produit est dans la corbeille — restaurez-le d'abord.", 409)

    await db.product.update({ where: { id }, data: { status: body.status } })
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "product.status",
      entityType: "product",
      entityId: id,
      details: { from: product.status, to: body.status, name: product.name },
    })

    invalidateCache("catalog")
    invalidateCache("product:")
    invalidateCache("admin:products")
    invalidateCache("admin:inventory")

    return ok({ id, status: body.status })
  })
}

/** Soft delete (corbeille). */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    const { id } = await params
    const product = await db.product.findUnique({ where: { id } })
    if (!product) throw new ApiError("Produit introuvable.", 404)
    if (product.deletedAt) throw new ApiError("Ce produit est déjà dans la corbeille.", 409)

    await db.product.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } })
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "product.delete",
      entityType: "product",
      entityId: id,
      details: { name: product.name },
    })

    invalidateCache("catalog")
    invalidateCache("product:")
    invalidateCache("admin:products")
    invalidateCache("admin:inventory")

    return ok({ id })
  })
}

// Le handler 405 n'est pas nécessaire — Next gère les méthodes absentes.
export const dynamic = "force-dynamic"
