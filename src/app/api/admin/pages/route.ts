import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { parseJson } from "@/lib/json"
import { logActivity } from "@/lib/activity"
import { invalidateCache, cached } from "@/lib/cache"
import { SECTION_TYPES, type PageSectionData } from "@/components/storefront/sections/registry"

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function validateSections(payload: unknown): PageSectionData[] {
  const sections = Array.isArray(payload) ? (payload as PageSectionData[]) : []
  if (sections.length > 60) throw new ApiError("Trop de sections (60 max).", 422)
  const knownTypes = new Set(SECTION_TYPES.map((s) => s.type))
  for (const s of sections) {
    if (!s?.id || !s?.type || !knownTypes.has(s.type)) {
      throw new ApiError("Structure de section invalide (type inconnu).", 422)
    }
    if (s.props && JSON.stringify(s.props).length > 30_000) {
      throw new ApiError("Une section contient un contenu trop volumineux.", 422)
    }
  }
  return sections
}

export { validateSections }

export async function GET() {
  return handle(async () => {
    await requireStaff("storefront.edit")
    const pages = await cached(
      "admin:pages",
      15_000,
      () => db.page.findMany({ orderBy: { updatedAt: "desc" } }),
      180_000,
    )
    return ok(
      pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        isPublished: p.isPublished,
        isSystem: p.isSystem,
        publishedAt: p.publishedAt,
        updatedAt: p.updatedAt,
        sectionCount: (p.publishedData ? parseJson<{ sections: unknown[] }>(p.publishedData, { sections: [] }).sections : []).length,
      })),
    )
  })
}

const createSchema = z.object({
  title: z.string().min(2).max(100),
  slug: z.string().max(80).regex(slugRegex, "slug invalide (minuscules et tirets)"),
})

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("storefront.edit")
    const body = await parseBody(request, createSchema)
    const existing = await db.page.findUnique({ where: { slug: body.slug } })
    if (existing) throw new ApiError("Ce slug est déjà utilisé par une autre page.", 409)
    const page = await db.page.create({
      data: { title: body.title, slug: body.slug, draftData: JSON.stringify({ sections: [] }) },
    })
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "page.create",
      entityType: "page",
      entityId: page.id,
      details: { title: page.title, slug: page.slug },
    })

    // Pages publiées rendues par le moteur de sections (cache « page:… »)
    invalidateCache("page:")
    invalidateCache("admin:pages")

    return ok({ id: page.id, slug: page.slug }, 201)
  })
}
