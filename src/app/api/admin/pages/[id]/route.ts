import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { validateSections } from "@/lib/page-sections"
import { invalidateCache } from "@/lib/cache"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireStaff("storefront.edit")
    const { id } = await params
    const page = await db.page.findUnique({ where: { id } })
    if (!page) throw new ApiError("Page introuvable.", 404)
    return ok(page)
  })
}

const patchSchema = z.object({
  draftData: z.object({ sections: z.array(z.record(z.string(), z.unknown())) }).passthrough(),
  title: z.string().min(2).max(100).optional(),
})

/** Sauvegarde du brouillon (utilisée par l'auto-save de l'éditeur). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireStaff("storefront.edit")
    const { id } = await params
    const page = await db.page.findUnique({ where: { id } })
    if (!page) throw new ApiError("Page introuvable.", 404)

    const body = await parseBody(request, patchSchema)
    validateSections(body.draftData.sections)

    const data: Record<string, unknown> = { draftData: JSON.stringify(body.draftData) }
    if (body.title !== undefined) data.title = body.title
    const updated = await db.page.update({ where: { id }, data })
    invalidateCache("admin:pages")
    return ok({ id: updated.id, updatedAt: updated.updatedAt })
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireStaff("storefront.edit")
    const { id } = await params
    const page = await db.page.findUnique({ where: { id } })
    if (!page) throw new ApiError("Page introuvable.", 404)
    if (page.isSystem) throw new ApiError("La page d'accueil système ne peut pas être supprimée.", 409)
    await db.page.delete({ where: { id } })
    invalidateCache("page:")
    invalidateCache("admin:pages")
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "page.delete",
      entityType: "page",
      entityId: id,
      details: { title: page.title },
    })
    return ok({ deleted: true })
  })
}
