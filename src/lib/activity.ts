import { db } from "@/lib/db"
import { parseJson, toJson } from "@/lib/json"

export { parseJson, toJson } from "@/lib/json"

export type Json<T = unknown> = T

/** Journalise une action sensible (traçabilité admin exigée par le cahier des charges). */
export async function logActivity(params: {
  actor?: { id: string; name: string; role: string } | null
  action: string
  entityType?: string
  entityId?: string
  details?: unknown
}) {
  try {
    await db.activityLog.create({
      data: {
        actorId: params.actor?.id ?? null,
        actorName: params.actor?.name ?? "Système",
        actorRole: params.actor?.role ?? "SYSTEM",
        action: params.action,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        detailsJson: toJson(params.details ?? {}),
      },
    })
  } catch (error) {
    // Le journal ne doit jamais casser une opération métier critique.
    console.error("[activity] échec journalisation", error)
  }
}
