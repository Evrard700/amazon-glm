import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError, queryInt } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache, cached } from "@/lib/cache"
import { productSchema } from "./schema"

/** Cache court du résultat : la liste admin (500 produits + relations)
 *  coûte ~1-3 s sur la base distante ; 15 s + invalidation à chaque
 *  mutation produit rendent la navigation admin INSTANTANÉE. */
export const adminProductsCacheKey = (deleted: boolean, take: number) => `admin:products:${deleted ? 1 : 0}:${take}`

/** Liste des produits (y compris corbeille via ?deleted=1) — permission products.view. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireStaff("products.view")
    const url = new URL(request.url)
    const deleted = url.searchParams.get("deleted") === "1"
    const take = Math.min(queryInt(request, "take", 500), 1000)

    const products = await cached(
      adminProductsCacheKey(deleted, take),
      15_000,
      () =>
        db.product.findMany({
          where: deleted ? { deletedAt: { not: null } } : { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take,
          include: {
            categories: { include: { category: { select: { name: true } } } },
            collections: { include: { collection: { select: { name: true } } } },
            variants: { orderBy: { position: "asc" } },
            _count: { select: { orderItems: true } },
          },
        }),
      180_000,
    )

    return ok(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        type: p.type,
        status: p.status,
        price: p.price,
        salePrice: p.salePrice,
        sku: p.sku,
        stock: p.stock,
        trackInventory: p.trackInventory,
        imagesJson: p.imagesJson,
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
        salesCount: p.salesCount,
        requiresShipping: p.requiresShipping,
        digitalFileName: p.digitalFileName,
        deletedAt: p.deletedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        categories: p.categories.map((c) => c.category.name),
        collections: p.collections.map((c) => c.collection.name),
        variants: p.variants.map((v) => ({ id: v.id, name: v.name, stock: v.stock, isActive: v.isActive, sku: v.sku, price: v.price })),
        variantsStock: p.variants.reduce((s, v) => s + v.stock, 0),
        orderItemsCount: p._count.orderItems,
      })),
    )
  })
}

/** Création d'un produit — permission products.manage, transaction sur les relations. */
export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    const body = await parseBody(request, productSchema)

    const existing = await db.product.findUnique({ where: { slug: body.slug } })
    if (existing) throw new ApiError("Ce slug est déjà utilisé par un autre produit.", 409)

    if (body.categoryIds.length > 0) {
      const count = await db.category.count({ where: { id: { in: body.categoryIds } } })
      if (count !== body.categoryIds.length) throw new ApiError("Catégorie invalide.", 422)
    }
    if (body.collectionIds.length > 0) {
      const count = await db.collection.count({ where: { id: { in: body.collectionIds } } })
      if (count !== body.collectionIds.length) throw new ApiError("Collection invalide.", 422)
    }

    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
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

      if (body.categoryIds.length > 0) {
        await tx.productCategory.createMany({
          data: body.categoryIds.map((categoryId) => ({ productId: created.id, categoryId })),
        })
      }
      if (body.collectionIds.length > 0) {
        await tx.productCollection.createMany({
          data: body.collectionIds.map((collectionId) => ({ productId: created.id, collectionId })),
        })
      }
      if (body.variants.length > 0) {
        await tx.productVariant.createMany({
          data: body.variants.map((v) => ({
            productId: created.id,
            name: v.name,
            optionsJson: JSON.stringify(v.options),
            sku: v.sku ?? null,
            price: v.price ?? null,
            stock: v.stock,
            imageUrl: v.imageUrl ?? null,
            isActive: v.isActive,
            position: v.position,
          })),
        })
      }
      return created
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "product.create",
      entityType: "product",
      entityId: product.id,
      details: { name: product.name, type: product.type, price: product.price, status: product.status },
    })

    // Catalogue storefront éventuellement impacté (produit visible)
    invalidateCache("catalog")
    invalidateCache("product:")
    invalidateCache("admin:products")

    return ok({ id: product.id, slug: product.slug }, 201)
  })
}

// ---------- Suppression multiple (sélection admin) — permission products.delete ----------

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(300),
  /** soft (défaut) = corbeille récupérable ; hard = suppression définitive. */
  mode: z.enum(["soft", "hard"]).optional(),
})

/**
 * Supprime plusieurs produits sélectionnés.
 *
 * - mode "soft" (défaut) : place les produits en corbeille (récupérable via
 *   « Restaurer »), les dépublie — AUCUNE perte de données.
 * - mode "hard" : suppression DÉFINITIVE, refusée pour les produits présents
 *   dans des commandes ou des paniers (l'historique commercial est intouchable).
 *   Nettoie aussi : variantes, liens catégories/collections, avis, offres
 *   upsell orphelines et références « produits liés ».
 */
export async function DELETE(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("products.delete")
    const body = await parseBody(request, bulkDeleteSchema)
    const ids = [...new Set(body.ids)]
    const hard = body.mode === "hard"

    const targets = await db.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        slug: true,
        deletedAt: true,
        _count: { select: { orderItems: true, cartItems: true } },
      },
    })

    // ---------- Corbeille (soft delete) ----------
    if (!hard) {
      const res = await db.product.updateMany({
        where: { id: { in: targets.map((p) => p.id) }, deletedAt: null },
        data: { deletedAt: new Date(), status: "DRAFT" },
      })
      if (res.count === 0) {
        throw new ApiError("Aucun produit mis à la corbeille : sélection introuvable ou déjà en corbeille.", 409)
      }
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "product.bulk_soft_delete",
        entityType: "product",
        entityId: ids.join(","),
        details: { trashed: res.count },
      })
      invalidateCache("catalog")
      invalidateCache("admin:products")
      return ok({
        trashed: res.count,
        message: `${res.count} produit(s) placé(s) dans la corbeille — restaurables à tout moment.`,
      })
    }

    // ---------- Suppression définitive (hard delete) ----------
    const blocked = targets
      .filter((p) => p._count.orderItems > 0 || p._count.cartItems > 0)
      .map((p) => ({
        name: p.name,
        reason:
          p._count.orderItems > 0
            ? "présent dans des commandes (historique préservé)"
            : "présent dans des paniers actifs",
      }))
    const hardDeletable = targets.filter((p) => p._count.orderItems === 0 && p._count.cartItems === 0)

    let deleted = 0
    if (hardDeletable.length > 0) {
      const delIds = hardDeletable.map((p) => p.id)
      deleted = (
        await db.$transaction(async (tx) => {
          // Offres upsell devenues orphelines (produit offert ou déclencheur).
          await tx.upsellOffer.deleteMany({
            where: { OR: [{ offerProductId: { in: delIds } }] },
          })
          // Nettoyage des références « produits liés » dans les AUTRES produits.
          const referencing = await tx.product.findMany({
            where: { deletedAt: null, relatedIdsJson: { not: "[]" } },
            select: { id: true, relatedIdsJson: true },
          })
          for (const prod of referencing) {
            try {
              const related = JSON.parse(prod.relatedIdsJson || "[]") as string[]
              if (Array.isArray(related) && related.some((r) => delIds.includes(r))) {
                await tx.product.update({
                  where: { id: prod.id },
                  data: { relatedIdsJson: JSON.stringify(related.filter((r) => !delIds.includes(r))) },
                })
              }
            } catch {
              /* JSON illisible : ignoré */
            }
          }
          // Variantes / liens / avis supprimés en cascade par les FK,
          // paniers et lignes de commande interdits par les gardes ci-dessus.
          return tx.product.deleteMany({ where: { id: { in: delIds } } })
        })
      ).count
    }

    if (deleted > 0) {
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "product.bulk_hard_delete",
        entityType: "product",
        entityId: hardDeletable.map((p) => p.id).join(","),
        details: { deleted, blocked: blocked.map((b) => b.name) },
      })
      invalidateCache("catalog")
      invalidateCache("product:")
      invalidateCache("admin:products")
    }

    if (deleted === 0) {
      throw new ApiError(
        blocked.length > 0
          ? `Aucun produit supprimé définitivement. ${blocked[0].name} : ${blocked[0].reason}.`
          : "Aucun produit supprimé : sélection introuvable.",
        409,
      )
    }

    return ok({
      deleted,
      blocked,
      message:
        blocked.length > 0
          ? `${deleted} supprimé(s) définitivement. ${blocked.length} protégé(s) : ${blocked.map((b) => b.name).join(", ")}.`
          : `${deleted} produit(s) supprimé(s) définitivement.`,
    })
  })
}
