import { db } from "@/lib/db"
import { ok, handle, parseBody } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { parseJson } from "@/lib/json"
import { campaignSchema } from "../_lib/schemas"
import { CAMPAIGN_SEGMENTS, SEGMENT_STORAGE, countAudience, type CampaignSegment } from "../_lib/helpers"

/**
 * GET /api/admin/marketing/campaigns — liste + nombre de destinataires par campagne.
 * POST /api/admin/marketing/campaigns — création (permission campaigns.manage).
 *
 * HONNÊTETÉ : sans fournisseur d'envoi (email/WhatsApp) configuré, les campagnes
 * restent DRAFT/SCHEDULED et AUCUN message n'est envoyé — jamais de simulation.
 */

function segmentKeyOf(storage: string | undefined): CampaignSegment {
  const entry = (Object.entries(SEGMENT_STORAGE) as [CampaignSegment, string][]).find(
    ([, value]) => value === storage,
  )
  return entry?.[0] ?? "TOUS_CLIENTS"
}

export async function GET() {
  return handle(async () => {
    await requireStaff("campaigns.manage")

    const campaigns = await db.campaign.findMany({ orderBy: { createdAt: "desc" } })

    const withCounts = await Promise.all(
      campaigns.map(async (c) => {
        const audience = parseJson<{ segment?: string; minOrders?: number | null }>(
          c.audienceJson,
          {},
        )
        const segmentKey = segmentKeyOf(audience.segment)
        const recipientCount = await countAudience(
          segmentKey,
          audience.minOrders ?? 1,
        )
        return {
          id: c.id,
          name: c.name,
          channel: c.channel,
          subject: c.subject,
          content: c.content,
          segmentKey,
          segmentStorage: audience.segment ?? "ALL",
          minOrders: audience.minOrders ?? null,
          recipientCount,
          status: c.status,
          scheduledAt: c.scheduledAt,
          note: c.note,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }
      }),
    )

    return ok({ campaigns: withCounts })
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("campaigns.manage")
    const body = await parseBody(request, campaignSchema)

    const campaign = await db.campaign.create({
      data: {
        name: body.name,
        channel: body.channel,
        subject: body.subject,
        content: body.content,
        audienceJson: JSON.stringify({
          segment: SEGMENT_STORAGE[body.segment],
          minOrders: body.segment === "CLIENTS_AVEC_COMMANDES" ? (body.minOrders ?? 1) : null,
        }),
        status: body.scheduledAt ? "SCHEDULED" : "DRAFT",
        scheduledAt: body.scheduledAt,
        note: body.note ?? null,
      },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "campaign.create",
      entityType: "campaign",
      entityId: campaign.id,
      details: {
        nom: campaign.name,
        canal: campaign.channel,
        segment: body.segment,
        statut: campaign.status,
        envoiReel: false,
      },
    })

    return ok({ id: campaign.id }, 201)
  })
}
