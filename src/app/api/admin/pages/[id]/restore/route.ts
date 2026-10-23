import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { validateSections } from "@/lib/page-sections"
import { parseJson } from "@/lib/json"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"

/**
 * RESTAURATION : copie une version antérieure dans le BROUILLON (jamais publiée
 * directement — l'admin relit puis publie).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireStaff("storefront.edit")
    const { id } = await params
    const body = await parseBody(request, z.object({ version: z.number().int().positive() }))
    const page = await db.page.findUnique({ where: { id } })
    if (!page) throw new ApiError("Page introuvable.", 404)
    const version = await db.pageVersion.findFirst({ where: { pageId: id, version: body.version } })
    if (!version) throw new ApiError("Version introuvable.", 404)

    const data = parseJson<{ sections: unknown[] }>(version.data, { sections: [] })
    validateSections(data.sections)
    await db.page.update({ where: { id }, data: { draftData: version.data } })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "page.restore",
      entityType: "page",
      entityId: id,
      details: { restoredVersion: body.version },
    })

    // Cohérence : le brouillon restauré peut être republié juste après
    invalidateCache("page:")

    return ok({ restored: body.version })
  })
}
