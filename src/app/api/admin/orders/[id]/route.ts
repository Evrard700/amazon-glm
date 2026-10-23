import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { parseJson } from "@/lib/json"

type Params = { params: Promise<{ id: string }> }

/** Détail complet d'une commande : articles, paiements, remboursements, événements, récompenses, upsells. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireStaff("orders.view")
    const { id } = await params

    const order = await db.order.findUnique({
      where: { id },
      include: {
        items: true,
        events: { orderBy: { createdAt: "asc" } },
        payments: { orderBy: { createdAt: "desc" } },
        refunds: { orderBy: { createdAt: "desc" } },
        user: { select: { id: true, name: true, email: true, phone: true, city: true } },
      },
    })
    if (!order) throw new ApiError("Commande introuvable.", 404)

    const itemIds = order.items.map((i) => i.id)
    const [grants, rewards, upsellChildren, upsellAcceptances, parentOrder, couponRedemptions] = await Promise.all([
      db.digitalDownloadGrant.findMany({ where: { orderItemId: { in: itemIds } } }),
      db.reward.findMany({
        where: { sourceOrderId: id },
        include: { beneficiary: { select: { id: true, name: true, email: true } } },
      }),
      order.upsellParentOrderId
        ? db.order.findMany({
            where: { upsellParentOrderId: order.upsellParentOrderId, id: { not: id } },
            select: { id: true, orderNumber: true, total: true, orderStatus: true, paymentStatus: true },
          })
        : db.order.findMany({
            where: { upsellParentOrderId: id },
            select: { id: true, orderNumber: true, total: true, orderStatus: true, paymentStatus: true },
          }),
      db.upsellAcceptance.findMany({
        where: { orderId: id },
        include: { offer: { select: { id: true, name: true } } },
      }),
      order.upsellParentOrderId
        ? db.order.findUnique({ where: { id: order.upsellParentOrderId }, select: { id: true, orderNumber: true, total: true } })
        : Promise.resolve(null),
      db.couponRedemption.findMany({ where: { orderId: id }, include: { coupon: { select: { code: true, type: true, value: true } } } }),
    ])

    const productsById = new Map(
      (await db.product.findMany({ where: { id: { in: order.items.map((i) => i.productId) } }, select: { id: true, type: true, imagesJson: true, digitalFileName: true } })).map((p) => [p.id, p]),
    )

    return ok({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        customer: order.user,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        address: order.address,
        city: order.city,
        shippingZoneName: order.shippingZoneName,
        shippingCost: order.shippingCost,
        deliveryNote: order.deliveryNote,
        trackingNumber: order.trackingNumber,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        subtotal: order.subtotal,
        couponCode: order.couponCode,
        couponDiscount: order.couponDiscount,
        promotionDiscount: order.promotionDiscount,
        promotions: parseJson<{ promotionId: string; name: string; amount: number; description?: string }[]>(order.promotionsJson, []),
        creditUsed: order.creditUsed,
        total: order.total,
        amountPaid: order.amountPaid,
        amountRefunded: order.amountRefunded,
        paymentMethodCode: order.paymentMethodCode,
        paymentMethodLabel: order.paymentMethodLabel,
        adminNote: order.adminNote,
        cancelledReason: order.cancelledReason,
        paidAt: order.paidAt,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
        cancelledAt: order.cancelledAt,
        upsellParentOrderId: order.upsellParentOrderId,
        items: order.items.map((i) => {
          const product = productsById.get(i.productId)
          return {
            id: i.id,
            productId: i.productId,
            productName: i.productName,
            productSlug: i.productSlug,
            variantName: i.variantName,
            sku: i.sku,
            unitPrice: i.unitPrice,
            quantity: i.quantity,
            lineTotal: i.lineTotal,
            isFreeItem: i.isFreeItem,
            digitalGranted: i.digitalGranted,
            type: product?.type ?? "PHYSICAL",
            image: product ? (parseJson<string[]>(product.imagesJson, [])[0] ?? null) : null,
            grants: grants
              .filter((g) => g.orderItemId === i.id)
              .map((g) => ({ id: g.id, downloadCount: g.downloadCount, limitCount: g.limitCount, revoked: g.revoked, revokedReason: g.revokedReason })),
          }
        }),
        events: order.events.map((e) => ({
          id: e.id,
          type: e.type,
          message: e.message,
          actorName: e.actorName,
          metadata: parseJson<Record<string, unknown>>(e.metadataJson, {}),
          createdAt: e.createdAt,
        })),
        payments: order.payments.map((p) => ({
          id: p.id,
          provider: p.provider,
          methodLabel: p.methodLabel,
          amount: p.amount,
          status: p.status,
          reference: p.reference,
          failureReason: p.failureReason,
          confirmedAt: p.confirmedAt,
          confirmedBy: p.confirmedBy,
          createdAt: p.createdAt,
        })),
        refunds: order.refunds.map((r) => ({
          id: r.id,
          amount: r.amount,
          mode: r.mode,
          status: r.status,
          reason: r.reason,
          note: r.note,
          processedAt: r.processedAt,
          createdAt: r.createdAt,
        })),
      },
      rewards: rewards.map((r) => ({
        id: r.id,
        program: r.program,
        amount: r.amount,
        status: r.status,
        reason: r.reason,
        beneficiary: r.beneficiary,
        createdAt: r.createdAt,
      })),
      upsell: {
        parent: parentOrder,
        children: upsellChildren,
        acceptances: upsellAcceptances.map((a) => ({ id: a.id, offerName: a.offer.name, acceptedPrice: a.acceptedPrice, createdAt: a.createdAt })),
      },
      coupon: couponRedemptions[0]?.coupon ?? null,
    })
  })
}

const patchSchema = z.object({
  adminNote: z.string().max(2000),
})

/** Note interne admin sur la commande — permission orders.manage. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const actor = await requireStaff("orders.manage")
    const { id } = await params
    const body = await parseBody(request, patchSchema)

    const order = await db.order.findUnique({ where: { id } })
    if (!order) throw new ApiError("Commande introuvable.", 404)

    await db.order.update({ where: { id }, data: { adminNote: body.adminNote } })
    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "order.admin_note",
      entityType: "order",
      entityId: id,
      details: { orderNumber: order.orderNumber, noteLength: body.adminNote.length },
    })
    return ok({ id })
  })
}
