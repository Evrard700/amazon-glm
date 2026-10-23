import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, queryInt } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { cached } from "@/lib/cache"
import { parseJson } from "@/lib/json"

export async function GET(request: Request) {
  return handle(async () => {
    await requireStaff("activity.view")
    const url = new URL(request.url)
    const page = Math.max(1, queryInt(request, "page", 1))
    const pageSize = Math.min(100, queryInt(request, "pageSize", 25))
    const action = url.searchParams.get("action")?.trim()
    const actor = url.searchParams.get("actor")?.trim()
    const days = url.searchParams.get("days")

    const where: Record<string, unknown> = {}
    if (action) where.action = { contains: action }
    if (actor) where.actorName = { contains: actor }
    if (days && Number(days) > 0) {
      const since = new Date(Date.now() - Number(days) * 24 * 3600 * 1000)
      where.createdAt = { gte: since }
    }

    // Journal volumineux : cache court par filtre — défilement fluide.
    const cacheKey = `admin:activity:${page}:${pageSize}:${action ?? ""}:${actor ?? ""}:${days ?? ""}`
    const [items, total] = await cached(
      cacheKey,
      10_000,
      () =>
        Promise.all([
          db.activityLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          db.activityLog.count({ where }),
        ]),
      120_000,
    )

    return ok({
      items: items.map((l) => ({ ...l, details: parseJson(l.detailsJson, {}) })),
      total,
      page,
      pageSize,
    })
  })
}
