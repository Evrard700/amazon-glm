import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { parseJson } from "@/lib/json"
import { invalidateCache, cached } from "@/lib/cache"
import { couponSchema } from "../_lib/schemas"

/**
 * GET /api/admin/marketing/coupons — liste complète + historique des utilisations.
 * POST /api/admin/marketing/coupons — création (permission coupons.manage).
 */

const listSchema = z.object({
  history: z.coerce.number().int().min(0).max(500).default(50),
})

export async function GET(request: Request) {
  return handle(async () => {
    await requireStaff("coupons.manage")
    const url = new URL(request.url)
    const { history } = listSchema.parse({
      history: url.searchParams.get("history") ?? 50,
    })

    const coupons = await cached(
      `admin:marketing:coupons:${history}`,
      15_000,
      () =>
        db.coupon.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          redemptions: {
            orderBy: { createdAt: "desc" },
            take: history,
            include: {
              order: { select: { id: true, orderNumber: true, total: true } },
              user: { select: { name: true, email: true } },
            },
          },
        },
      }),
      180_000,
    )

    return ok({
      coupons: coupons.map((c) => ({
        id: c.id,
        code: c.code,
        type: c.type,
        value: c.value,
        description: c.description,
        appliesTo: c.appliesTo,
        productIds: parseJson<string[]>(c.productIdsJson, []),
        categoryIds: parseJson<string[]>(c.categoryIdsJson, []),
        minOrderAmount: c.minOrderAmount,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        perCustomerLimit: c.perCustomerLimit,
        freeProductId: c.freeProductId,
        startsAt: c.startsAt,
        expiresAt: c.expiresAt,
        isActive: c.isActive,
        targetUser: c.user
          ? { id: c.user.id, name: c.user.name, email: c.user.email }
          : null,
        createdAt: c.createdAt,
        redemptionCount: c.redemptions.length,
      })),
      redemptions: coupons.flatMap((c) =>
        c.redemptions.map((r) => ({
          id: r.id,
          couponCode: c.code,
          couponType: c.type,
          couponValue: c.value,
          user: r.user ? { name: r.user.name, email: r.user.email } : null,
          orderNumber: r.order.orderNumber,
          orderTotal: r.order.total,
          createdAt: r.createdAt,
        })),
      ),
    })
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("coupons.manage")
    const body = await parseBody(request, couponSchema)

    const existing = await db.coupon.findUnique({ where: { code: body.code } })
    if (existing) {
      throw new ApiError(
        `Le code « ${body.code} » existe déjà. Choisissez-en un autre ou générez-le automatiquement.`,
        409,
      )
    }

    const coupon = await db.coupon.create({
      data: {
        code: body.code,
        type: body.type,
        value: body.value,
        description: body.description ?? null,
        appliesTo: body.appliesTo,
        productIdsJson: JSON.stringify(body.productIds),
        categoryIdsJson: JSON.stringify(body.categoryIds),
        minOrderAmount: body.minOrderAmount,
        maxUses: body.maxUses,
        perCustomerLimit: body.perCustomerLimit,
        freeProductId: body.freeProductId ?? null,
        startsAt: body.startsAt,
        expiresAt: body.expiresAt,
        isActive: body.isActive,
        userId: body.userId ?? null,
        createdById: actor.id,
      },
    })

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "coupon.create",
      entityType: "coupon",
      entityId: coupon.id,
      details: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        cible: coupon.userId ?? "tous les clients",
      },
    })

    // Cache lecture panier (catalog:coupon:CODE) — le nouveau code est frais
    invalidateCache("catalog:coupon:")
    invalidateCache("admin:marketing")

    return ok({ id: coupon.id, code: coupon.code }, 201)
  })
}
