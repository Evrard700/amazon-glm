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
  parentId: z.string().optional().nullable(),
  position: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
})

/** Liste hiérarchique des catégories avec nombre de produits. */
export async function GET() {
  return handle(async () => {
    await requireStaff("products.view")
    const categories = await cached(
      "admin:categories",
      15_000,
      () =>
        db.category.findMany({
          orderBy: [{ position: "asc" }, { name: "asc" }],
          include: { _count: { select: { products: true } } },
        }),
      180_000,
    )
    return ok(
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        imageUrl: c.imageUrl,
        parentId: c.parentId,
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

    if (await db.category.findUnique({ where: { slug: body.slug } })) {
      throw new ApiError("Ce slug est déjà utilisé par une autre catégorie.", 409)
    }
    if (body.parentId) {
      const parent = await db.category.findUnique({ where: { id: body.parentId } })
      if (!parent) throw new ApiError("Catégorie parente introuvable.", 422)
    }

    const category = await db.category.create({
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
      action: "category.create",
      entityType: "category",
      entityId: category.id,
      details: { name: category.name, slug: category.slug },
    })

    invalidateCache("categories")
    invalidateCache("catalog")
    invalidateCache("admin:categories")

    return ok({ id: category.id }, 201)
  })
}
