import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { parseJson } from "@/lib/json"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"

/** Masque une valeur de clé API pour l'affichage (jamais de secret en clair côté client). */
function maskConfig(config: Record<string, string>): Record<string, { masked: string; configured: boolean }> {
  const out: Record<string, { masked: string; configured: boolean }> = {}
  for (const [k, v] of Object.entries(config)) {
    out[k] = v && v.length > 3 ? { masked: `${v.slice(0, 3)}••••••`, configured: true } : { masked: "", configured: false }
  }
  return out
}

export async function GET() {
  return handle(async () => {
    await requireStaff("settings.manage")
    const methods = await db.paymentMethod.findMany({ orderBy: { position: "asc" } })
    return ok(
      methods.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        description: m.description,
        instructions: m.instructions,
        isOnline: m.isOnline,
        isActive: m.isActive,
        position: m.position,
        configKeys: m.isOnline ? ["apiKey", "merchantId", "webhookSecret"] : [],
        configMasked: m.isOnline ? maskConfig(parseJson<Record<string, string>>(m.configJson, {})) : {},
        fullyConfigured:
          !m.isOnline || Object.values(parseJson<Record<string, string>>(m.configJson, {})).some((v) => v && v.length > 3),
      })),
    )
  })
}

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(300).optional().nullable(),
  instructions: z.string().max(600).optional().nullable(),
  /** Clés secrètes serveur — stockées en DB, renvoyées uniquement masquées. */
  config: z.record(z.string(), z.string()).optional(),
  webhookUrl: z.string().optional(),
})

export async function PATCH(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("settings.manage")
    const url = new URL(request.url)
    const id = url.searchParams.get("id")
    if (!id) throw new ApiError("Paramètre id requis.", 400)
    const body = await parseBody(request, patchSchema)

    const method = await db.paymentMethod.findUnique({ where: { id } })
    if (!method) throw new ApiError("Moyen de paiement introuvable.", 404)

    // Avertissement honest : activer un fournisseur en ligne sans clés ne permet AUCUN paiement
    if (body.isActive === true && method.isOnline) {
      const config = parseJson<Record<string, string>>(method.configJson, {})
      const hasKeys = Object.values(config).some((v) => v && v.length > 3)
      if (body.config) {
        for (const [k, v] of Object.entries(body.config)) {
          if (v && !v.startsWith("•")) config[k] = v // ne pas écraser par une valeur masquée
        }
      }
      if (!hasKeys && !Object.values(config).some((v) => v && v.length > 3)) {
        throw new ApiError(
          "Impossible d'activer ce fournisseur : aucune clé API serveur n'est configurée. Renseignez les clés d'abord (une intégration sans clés réelles ne traiterait aucun paiement).",
          409,
        )
      }
      await db.paymentMethod.update({ where: { id }, data: { configJson: JSON.stringify(config) } })
    }

    if (body.config && !body.isActive) {
      const config = parseJson<Record<string, string>>(method.configJson, {})
      for (const [k, v] of Object.entries(body.config)) {
        if (v && !v.startsWith("•")) config[k] = v
      }
      await db.paymentMethod.update({ where: { id }, data: { configJson: JSON.stringify(config) } })
    }

    const data: Record<string, unknown> = {}
    if (body.isActive !== undefined) data.isActive = body.isActive
    if (body.name !== undefined) data.name = body.name
    if (body.description !== undefined) data.description = body.description
    if (body.instructions !== undefined) data.instructions = body.instructions

    if (Object.keys(data).length > 0) {
      await db.paymentMethod.update({ where: { id }, data })
    }

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "settings.payments.update",
      entityType: "paymentMethod",
      entityId: id,
      details: { fields: Object.keys(body) },
    })

    const updated = await db.paymentMethod.findUniqueOrThrow({ where: { id } })

    // Méthodes affichées au checkout via cache
    invalidateCache("settings")
    invalidateCache("zones")
    invalidateCache("payment-methods")

    return ok({
      id: updated.id,
      name: updated.name,
      isActive: updated.isActive,
      configMasked: updated.isOnline ? maskConfig(parseJson<Record<string, string>>(updated.configJson, {})) : {},
    })
  })
}
