import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"

const schema = z.object({
  storeName: z.string().min(2).max(80).optional(),
  tagline: z.string().max(120).optional(),
  logoUrl: z.string().max(500).optional().nullable(),
  faviconUrl: z.string().max(500).optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  announcementText: z.string().max(200).optional().nullable(),
  announcementActive: z.boolean().optional(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().max(40).optional().nullable(),
  whatsappNumber: z.string().max(40).optional().nullable(),
  addressLine: z.string().max(200).optional().nullable(),
  facebookUrl: z.string().max(300).optional().nullable(),
  instagramUrl: z.string().max(300).optional().nullable(),
  footerAbout: z.string().max(600).optional().nullable(),
  metaTitle: z.string().max(120).optional().nullable(),
  metaDescription: z.string().max(320).optional().nullable(),
  freeShippingThreshold: z.number().int().min(0).max(10_000_000).optional(),
  lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
  guestCheckoutEnabled: z.boolean().optional(),
  reviewsAutoApprove: z.boolean().optional(),
  storeOpen: z.boolean().optional(),
})

export async function GET() {
  return handle(async () => {
    await requireStaff("settings.manage")
    const settings = await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })
    return ok(settings)
  })
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("settings.manage")
    const body = await parseBody(request, schema)
    const settings = await db.storeSettings.update({ where: { id: 1 }, data: body })
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "settings.update",
      entityType: "settings",
      entityId: "1",
      details: { fields: Object.keys(body) },
    })
    // Réglages lus par le storefront (identité, seuils, checkout)
    invalidateCache("settings")
    invalidateCache("zones")
    invalidateCache("payment-methods")
    return ok(settings)
  })
}
