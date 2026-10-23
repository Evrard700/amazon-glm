import { z } from "zod"
import { ok, handle, ApiError } from "@/lib/api"
import { db } from "@/lib/db"
import { requireStaff } from "@/lib/auth"
import { CAMPAIGN_SEGMENTS, countAudience, type CampaignSegment } from "../../_lib/helpers"

/**
 * GET /api/admin/marketing/campaigns/audience-count?segment=…&minOrders=…
 * Calcul d'audience en direct (lecture seule) pour le dialog de campagne :
 * « Cette campagne ciblerait ≈ N destinataires ». Aucune donnée personnelle
 * n'est renvoyée — uniquement un comptage agrégé.
 */

const querySchema = z.object({
  segment: z.enum(CAMPAIGN_SEGMENTS),
  minOrders: z.coerce.number().int().min(1).max(1000).default(1),
})

export async function GET(request: Request) {
  return handle(async () => {
    await requireStaff("campaigns.manage")
    const url = new URL(request.url)
    const parsed = querySchema.safeParse({
      segment: url.searchParams.get("segment") ?? "",
      minOrders: url.searchParams.get("minOrders") ?? 1,
    })
    if (!parsed.success) {
      throw new ApiError("Segment d'audience invalide.", 422)
    }
    const { segment, minOrders } = parsed.data as { segment: CampaignSegment; minOrders: number }

    const count = await countAudience(segment, minOrders)
    return ok({ segment, minOrders, count })
  })
}
