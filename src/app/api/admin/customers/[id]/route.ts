import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { invalidateCache } from "@/lib/cache"
import { formatXOF } from "@/lib/money"

type Params = { params: Promise<{ id: string }> }

/** Fiche CRM complète d'un client — permission customers.view. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireStaff("customers.view")
    const { id } = await params

    const user = await db.user.findUnique({
      where: { id },
      include: {
        referredBy: { select: { id: true, name: true, email: true, referralCode: true } },
        referrals: { select: { id: true, name: true, email: true, createdAt: true } },
      },
    })
    if (!user) throw new ApiError("Client introuvable.", 404)

    const [orders, creditTransactions, rewards, reviews, notes] = await Promise.all([
      db.order.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true, orderNumber: true, total: true, amountPaid: true,
          orderStatus: true, paymentStatus: true, createdAt: true,
        },
      }),
      db.creditTransaction.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.reward.findMany({
        where: { beneficiaryId: id },
        orderBy: { createdAt: "desc" },
        include: { sourceOrder: { select: { id: true, orderNumber: true } } },
      }),
      db.review.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        include: { product: { select: { id: true, name: true } } },
      }),
      db.customerNote.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true, role: true } } },
      }),
    ])

    return ok({
      customer: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        city: user.city,
        address: user.address,
        storeCredit: user.storeCredit,
        tags: JSON.parse(user.crmTagsJson || "[]") as string[],
        marketingConsent: user.marketingConsent,
        isActive: user.isActive,
        referralCode: user.referralCode,
        referredBy: user.referredBy,
        referrals: user.referrals,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
      orders,
      creditTransactions,
      rewards: rewards.map((r) => ({
        id: r.id,
        program: r.program,
        amount: r.amount,
        status: r.status,
        reason: r.reason,
        sourceOrder: r.sourceOrder,
        createdAt: r.createdAt,
      })),
      reviews,
      notes,
    })
  })
}

const patchSchema = z
  .object({
    tags: z.array(z.string().min(1).max(30)).max(15).optional(),
    note: z.string().min(1).max(1000).optional(),
    isActive: z.boolean().optional(),
    creditAdjustment: z
      .object({
        amount: z.number().int().refine((v) => v !== 0, "Le montant doit être différent de 0."),
        reason: z.string().min(3).max(200),
      })
      .optional(),
  })
  .refine((d) => d.tags !== undefined || d.note !== undefined || d.isActive !== undefined || d.creditAdjustment !== undefined, {
    message: "Aucune modification fournie.",
  })

/** Mise à jour CRM — permission customers.manage. Ajustement crédit → CreditTransaction ADMIN_ADJUSTMENT. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("customers.manage")
    const { id } = await params
    const body = await parseBody(request, patchSchema)

    const user = await db.user.findUnique({ where: { id } })
    if (!user) throw new ApiError("Client introuvable.", 404)

    // Ajustement de crédit boutique
    if (body.creditAdjustment) {
      const { amount, reason } = body.creditAdjustment
      const newBalance = user.storeCredit + amount
      if (newBalance < 0) {
        throw new ApiError(`Ajustement impossible : le solde deviendrait négatif (${formatXOF(newBalance)}).`, 409)
      }
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { storeCredit: newBalance } })
        await tx.creditTransaction.create({
          data: {
            userId: id,
            amount,
            type: "ADMIN_ADJUSTMENT",
            description: `Ajustement manuel par ${actor.name} : ${reason}`,
            balanceAfter: newBalance,
            createdById: actor.id,
          },
        })
      })
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "customer.credit_adjust",
        entityType: "customer",
        entityId: id,
        details: { customer: user.name, amount, reason, balanceAfter: newBalance },
      })
    }

    if (body.tags) {
      await db.user.update({ where: { id }, data: { crmTagsJson: JSON.stringify(body.tags) } })
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "customer.tags_update",
        entityType: "customer",
        entityId: id,
        details: { customer: user.name, tags: body.tags },
      })
    }

    if (typeof body.isActive === "boolean") {
      await db.user.update({ where: { id }, data: { isActive: body.isActive } })
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "customer.active_toggle",
        entityType: "customer",
        entityId: id,
        details: { customer: user.name, isActive: body.isActive },
      })
    }

    if (body.note) {
      await db.customerNote.create({
        data: { userId: id, authorId: actor.id, content: body.note },
      })
      await logActivity({
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: "customer.note_add",
        entityType: "customer",
        entityId: id,
        details: { customer: user.name, noteLength: body.note.length },
      })
    }

    invalidateCache("admin:customers")

    return ok({ id })
  })
}
