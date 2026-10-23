import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache, cached } from "@/lib/cache"

const schema = z.object({
  logoUrl: z.string().max(500).optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  radius: z.number().int().min(0).max(24).optional(),
  announcementText: z.string().max(200).optional().nullable(),
  announcementActive: z.boolean().optional(),
  tagline: z.string().max(120).optional(),
  footerAbout: z.string().max(600).optional().nullable(),
})

/** Thème visuel (identité) — appliqué à la boutique publique via variables CSS. */
export async function GET() {
  return handle(async () => {
    await requireStaff("theme.edit")
    const s = await cached(
      "admin:theme",
      15_000,
      () => db.storeSettings.findUniqueOrThrow({ where: { id: 1 } }),
      180_000,
    )
    return ok({
      logoUrl: s.logoUrl,
      primaryColor: s.primaryColor,
      accentColor: s.accentColor,
      radius: s.radius,
      announcementText: s.announcementText,
      announcementActive: s.announcementActive,
      tagline: s.tagline,
      footerAbout: s.footerAbout,
      storeName: s.storeName,
    })
  })
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("theme.edit")
    const body = await parseBody(request, schema)
    const s = await db.storeSettings.update({ where: { id: 1 }, data: body })
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "theme.update",
      entityType: "settings",
      entityId: "1",
      details: { fields: Object.keys(body) },
    })
    // Identité visuelle appliquée au storefront via variables CSS
    invalidateCache("settings")
    invalidateCache("admin:theme")
    return ok({
      logoUrl: s.logoUrl,
      primaryColor: s.primaryColor,
      accentColor: s.accentColor,
      radius: s.radius,
      announcementText: s.announcementText,
      announcementActive: s.announcementActive,
      tagline: s.tagline,
      footerAbout: s.footerAbout,
      storeName: s.storeName,
    })
  })
}
