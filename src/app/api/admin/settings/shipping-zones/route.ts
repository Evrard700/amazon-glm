import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { toJson } from "@/lib/json"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"

export async function GET() {
  return handle(async () => {
    await requireStaff("settings.manage")
    const zones = await db.shippingZone.findMany({ orderBy: { position: "asc" } })
    return ok(zones)
  })
}

const createSchema = z.object({
  name: z.string().min(2).max(100),
  cities: z.array(z.string().min(1).max(60)).min(1),
  baseCost: z.number().int().min(0).max(100_000),
  estimatedDaysMin: z.number().int().min(0).max(30),
  estimatedDaysMax: z.number().int().min(0).max(60),
})

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("settings.manage")
    const body = await parseBody(request, createSchema)
    if (body.estimatedDaysMax < body.estimatedDaysMin) throw new ApiError("Le délai maximum doit être ≥ au minimum.", 422)
    const count = await db.shippingZone.count()
    const zone = await db.shippingZone.create({
      data: {
        name: body.name,
        citiesJson: toJson(body.cities),
        baseCost: body.baseCost,
        estimatedDaysMin: body.estimatedDaysMin,
        estimatedDaysMax: body.estimatedDaysMax,
        position: count + 1,
      },
    })
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "settings.shipping.create",
      entityType: "shippingZone",
      entityId: zone.id,
      details: { name: zone.name },
    })

    // Zones affichées au checkout via cache
    invalidateCache("settings")
    invalidateCache("zones")
    invalidateCache("payment-methods")

    return ok(zone, 201)
  })
}

const patchSchema = createSchema.partial().extend({ isActive: z.boolean().optional(), position: z.number().int().optional() })

export async function PATCH(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("settings.manage")
    const url = new URL(request.url)
    const id = url.searchParams.get("id")
    if (!id) throw new ApiError("Paramètre id requis.", 400)
    const body = await parseBody(request, patchSchema)
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.cities !== undefined) data.citiesJson = toJson(body.cities)
    if (body.baseCost !== undefined) data.baseCost = body.baseCost
    if (body.estimatedDaysMin !== undefined) data.estimatedDaysMin = body.estimatedDaysMin
    if (body.estimatedDaysMax !== undefined) data.estimatedDaysMax = body.estimatedDaysMax
    if (body.isActive !== undefined) data.isActive = body.isActive
    if (body.position !== undefined) data.position = body.position
    const zone = await db.shippingZone.update({ where: { id }, data })
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "settings.shipping.update",
      entityType: "shippingZone",
      entityId: id,
      details: { fields: Object.keys(body) },
    })

    // Zones affichées au checkout via cache
    invalidateCache("settings")
    invalidateCache("zones")
    invalidateCache("payment-methods")

    return ok(zone)
  })
}

export async function DELETE(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("settings.manage")
    const url = new URL(request.url)
    const id = url.searchParams.get("id")
    if (!id) throw new ApiError("Paramètre id requis.", 400)
    const inUse = await db.order.findFirst({ where: { shippingZoneId: id } })
    if (inUse) throw new ApiError("Cette zone est utilisée par des commandes : désactivez-la plutôt que de la supprimer.", 409)
    await db.shippingZone.delete({ where: { id } })
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "settings.shipping.delete",
      entityType: "shippingZone",
      entityId: id,
    })

    // Zones affichées au checkout via cache
    invalidateCache("settings")
    invalidateCache("zones")
    invalidateCache("payment-methods")

    return ok({ deleted: true })
  })
}
