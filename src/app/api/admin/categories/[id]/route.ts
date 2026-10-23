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
  parentId: z.string().optional().nullable(),
  position: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
})

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    const { id } = await params
    const body = await parseBody(request, updateSchema)

    const category = await db.category.findUnique({ where: { id } })
    if (!category) throw new ApiError("Catégorie introuvable.", 404)

    const slugConflict = await db.category.findFirst({ where: { slug: body.slug, id: { not: id } } })
    if (slugConflict) throw new ApiError("Ce slug est déjà utilisé par une autre catégorie.", 409)
    if (body.parentId === id) throw new ApiError("Une catégorie ne peut pas être sa propre parente.", 422)
    if (body.parentId) {
      const parent = await db.category.findUnique({ where: { id: body.parentId } })
      if (!parent) throw new ApiError("Catégorie parente introuvable.", 422)
    }

    await db.category.update({
      where: { id },
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
        parentId: body.parentId ?? null,
        position: body.position,
        isActive: body.isActive,
      },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "category.update",
      entityType: "category",
      entityId: id,
      details: { name: body.name, slug: body.slug },
    })

    invalidateCache("categories")
    invalidateCache("catalog")
    invalidateCache("admin:categories")

    return ok({ id })
  })
}

/** Suppression refusée si des produits sont liés ou si elle a des sous-catégories actives. */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    const { id } = await params

    const category = await db.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    })
    if (!category) throw new ApiError("Catégorie introuvable.", 404)

    if (category._count.products > 0) {
      throw new ApiError(
        `Suppression impossible : ${category._count.products} produit(s) appartiennent à cette catégorie. Retirez-les d'abord.`,
        409,
      )
    }
    if (category._count.children > 0) {
      throw new ApiError("Suppression impossible : cette catégorie a des sous-catégories. Supprimez-les d'abord.", 409)
    }

    await db.category.delete({ where: { id } })
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "category.delete",
      entityType: "category",
      entityId: id,
      details: { name: category.name },
    })

    invalidateCache("categories")
    invalidateCache("catalog")
    invalidateCache("admin:categories")

    return ok({ id })
  })
}
