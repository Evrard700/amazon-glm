import { db } from "@/lib/db"
import { ok, handle, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { parseJson } from "@/lib/json"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"
import { validateSections } from "@/lib/page-sections"

/**
 * PUBLICATION : copie du brouillon vers publishedData + snapshot de version.
 * Le rendu public de la boutique utilise UNIQUEMENT publishedData.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireStaff("storefront.edit")
    const { id } = await params
    const page = await db.page.findUnique({ where: { id } })
    if (!page) throw new ApiError("Page introuvable.", 404)
    if (!page.draftData) throw new ApiError("Aucun brouillon à publier.", 409)

    const draft = parseJson<{ sections: unknown[] }>(page.draftData, { sections: [] })
    validateSections(draft.sections)
    if (draft.sections.length === 0) throw new ApiError("La page est vide : ajoutez au moins une section.", 422)

    const maxVersion = await db.pageVersion.findFirst({ where: { pageId: id }, orderBy: { version: "desc" } })
    const nextVersion = (maxVersion?.version ?? 0) + 1

    const [updated] = await db.$transaction([
      db.page.update({
        where: { id },
        data: { publishedData: page.draftData, isPublished: true, publishedAt: new Date() },
      }),
      db.pageVersion.create({
        data: { pageId: id, version: nextVersion, label: `Publication`, data: page.draftData, createdById: actor.id },
      }),
    ])

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "page.publish",
      entityType: "page",
      entityId: id,
      details: { title: page.title, version: nextVersion, sections: draft.sections.length },
    })

    // Le rendu public de cette page est caché — publication immédiate
    invalidateCache("page:")

    return ok({ id: updated.id, isPublished: true, publishedAt: updated.publishedAt, version: nextVersion })
  })
}
