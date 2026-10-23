import { z } from "zod"
import { db } from "@/lib/db"
import { fail, ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { campaignSchema } from "../../_lib/schemas"
import { SEGMENT_STORAGE } from "../../_lib/helpers"

/**
 * PATCH /api/admin/marketing/campaigns/[id] — modification complète.
 * DELETE /api/admin/marketing/campaigns/[id] — suppression (aucun envoi n'a eu lieu).
 */

const idSchema = z.string().min(1)
const partialCampaign = campaignSchema.partial()

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await requireStaff("campaigns.manage")
    const { id } = await params
    const campaignId = idSchema.parse(id)

    const campaign = await db.campaign.findUnique({ where: { id: campaignId } })
    if (!campaign) throw new ApiError("Campagne introuvable.", 404)

    const body = await parseBody(request, partialCampaign)

    const updated = await db.campaign.update({
      where: { id: campaignId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.channel !== undefined ? { channel: body.channel } : {}),
        ...(body.subject !== undefined ? { subject: body.subject } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.segment !== undefined
          ? {
              audienceJson: JSON.stringify({
                segment: SEGMENT_STORAGE[body.segment],
                minOrders:
                  body.segment === "CLIENTS_AVEC_COMMANDES" ? (body.minOrders ?? 1) : null,
              }),
            }
          : {}),
        ...(body.minOrders !== undefined && body.segment === undefined
          ? {
              audienceJson: JSON.stringify({
                segment: JSON.parse(campaign.audienceJson).segment ?? "ALL",
                minOrders: body.minOrders ?? null,
              }),
            }
          : {}),
        ...(body.scheduledAt !== undefined ? { scheduledAt: body.scheduledAt } : {}),
        ...(body.note !== undefined ? { note: body.note ?? null } : {}),
        status: body.scheduledAt !== undefined ? (body.scheduledAt ? "SCHEDULED" : "DRAFT") : undefined,
      },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "campaign.update",
      entityType: "campaign",
      entityId: campaignId,
      details: { nom: updated.name, statut: updated.status },
    })

    return ok({ id: updated.id, status: updated.status })
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireStaff("campaigns.manage")
    const { id } = await params
    const campaignId = idSchema.parse(id)

    const campaign = await db.campaign.findUnique({ where: { id: campaignId } })
    if (!campaign) throw new ApiError("Campagne introuvable.", 404)

    await db.campaign.delete({ where: { id: campaignId } })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "campaign.delete",
      entityType: "campaign",
      entityId: campaignId,
      details: { nom: campaign.name },
    })

    return ok({ id: campaignId, deleted: true })
  } catch (error) {
    if (error instanceof ApiError) return fail(error.message, error.status, error.code)
    console.error("[api]", error)
    return fail("Une erreur interne est survenue. Veuillez réessayer.", 500)
  }
}
