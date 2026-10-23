import { randomBytes } from "crypto"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { ApiError } from "@/lib/api"
import { parseJson } from "@/lib/json"
import { formatXOF } from "@/lib/money"
import { invalidateCache } from "@/lib/cache"
import { computeCart, CART_COOKIE } from "@/lib/services/cart"
import {
  processCommissionRewardForOrder,
  processFullRefundRewardForOrder,
  cancelRewardsForOrder,
} from "@/lib/services/referrals"
import { logActivity } from "@/lib/activity"
import type { User } from "@prisma/client"
import { Prisma } from "@prisma/client"

/**
 * COMMANDES — statuts de commande et de paiement SÉPARÉS.
 * Créer une commande ≠ la payer. Le paiement n'est confirmé QUE par :
 *  - confirmation manuelle autorisée (admin, permission payments.confirm), journalisée ;
 *  - un webhook vérifié et idempotent d'un fournisseur réellement configuré.
 * Aucune simulation de paiement.
 */

export type Actor = { id: string; name: string; role: string } | null

function generateOrderNumber(): string {
  const d = new Date()
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  return `TM-${ymd}-${randomBytes(3).toString("hex").toUpperCase()}`
}

export interface CreateOrderInput {
  customerName: string
  customerEmail: string
  customerPhone: string
  address: string
  city: string
  shippingZoneId: string
  paymentMethodCode: string
  deliveryNote?: string
  useCredit?: boolean
  /** Session déjà résolue par la route (cache 5 s) — aucun rechargement DB. */
  sessionUser: User | null
}

export interface CreateOrderResult {
  orderId: string
  orderNumber: string
  accessToken: string
  alreadyExisting: boolean
  order: {
    orderNumber: string
    total: number
    paymentMethodLabel: string | null
    orderStatus: string
    paymentStatus: string
  }
}

/**
 * Crée la commande à partir du panier serveur. Le client n'envoie AUCUN prix :
 * tout est recalculé (lignes, promotions BXGY, coupon, livraison, crédit).
 * Idempotent : si le panier a déjà été converti, renvoie la commande existante.
 *
 * FLUIDITÉ — au lieu de ~22 allers-retours Supabase séquentiels :
 *  1. UNE salve parallèle (panier recalculé, ligne panier, zone, paiement, réglages)
 *  2. UNE salve parallèle (produits offerts) si nécessaire
 *  3. Transaction compacte : createMany (1 requête), décréments de stock
 *     ATOMIQUES conditionnels (updateMany stock >= qté → rollback si insuffisant),
 *     écritures indépendantes en salves parallèles.
 * Sémantique financière identique : prix 100% serveur, stock vérifié en
 * transaction (plus strict qu'avant : le test et le décrément sont atomiques).
 */
export async function createOrderFromCart(input: CreateOrderInput): Promise<CreateOrderResult> {
  const user = input.sessionUser

  const [cartCookie, store] = await Promise.all([
    computeCart({ ignoreCoupon: false }),
    cookies(),
  ])

  // Panier du cookie
  const token = store.get(CART_COOKIE)?.value
  if (!token) throw new ApiError("Votre panier est introuvable. Veuillez le reconstituer.", 400)

  // SALVE 1 — panier, zone, moyen de paiement, réglages (4 requêtes → 1 salve)
  const [cart, zone, method, settings] = await Promise.all([
    db.cart.findUnique({ where: { sessionToken: token }, include: { items: true } }),
    db.shippingZone.findFirst({ where: { id: input.shippingZoneId, isActive: true } }),
    db.paymentMethod.findUnique({ where: { code: input.paymentMethodCode } }),
    db.storeSettings.findUniqueOrThrow({ where: { id: 1 } }),
  ])

  // Commande invitée : autorisée seulement si le réglage l'active
  if (!user && !settings.guestCheckoutEnabled) {
    throw new ApiError("Veuillez créer un compte pour finaliser votre commande.", 401)
  }

  if (!cart || cart.status !== "ACTIVE" || cart.items.length === 0) {
    throw new ApiError("Votre panier est vide.", 400)
  }
  if (cart.convertedOrderId) {
    // Idempotence : ne JAMAIS créer deux commandes pour le même panier
    const existing = await db.order.findUnique({
      where: { id: cart.convertedOrderId },
      select: {
        id: true,
        orderNumber: true,
        accessToken: true,
        total: true,
        paymentMethodLabel: true,
        orderStatus: true,
        paymentStatus: true,
      },
    })
    if (existing) {
      return {
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        accessToken: existing.accessToken,
        alreadyExisting: true,
        order: {
          orderNumber: existing.orderNumber,
          total: existing.total,
          paymentMethodLabel: existing.paymentMethodLabel,
          orderStatus: existing.orderStatus,
          paymentStatus: existing.paymentStatus,
        },
      }
    }
  }

  if (cartCookie.lines.length === 0 && cartCookie.extraLines.length === 0) {
    throw new ApiError("Votre panier ne contient aucun article disponible.", 400)
  }
  if (!zone) throw new ApiError("Zone de livraison invalide.", 400)
  if (!method || !method.isActive) throw new ApiError("Ce moyen de paiement n'est pas disponible.", 400)
  if (method.isOnline) {
    const config = parseJson<Record<string, string>>(method.configJson, {})
    const hasKeys = Object.values(config).some((v) => v && v.length > 3)
    if (!hasKeys) {
      throw new ApiError(
        `Le paiement en ligne « ${method.name} » nécessite une configuration serveur (clés API) avant de pouvoir être utilisé.`,
        409,
      )
    }
  }

  // ---- Montants (100% serveur) ----
  const subtotal = cartCookie.subtotal
  const promotionDiscount = cartCookie.promotionDiscount
  const couponDiscount = cartCookie.couponDiscount
  const couponFreeShipping = cartCookie.coupon?.freeShipping ?? false

  // Livraison : produits physiques requis ? (produits offerts évalués en 1 salve)
  const hasPhysical = cartCookie.lines.some((l) => l.product.requiresShipping)
  let needsShipping = hasPhysical
  if (!needsShipping && cartCookie.extraLines.length > 0) {
    const extraProducts = await db.product.findMany({
      where: { id: { in: cartCookie.extraLines.map((e) => e.productId) } },
      select: { requiresShipping: true },
    })
    needsShipping = extraProducts.some((p) => p.requiresShipping)
  }

  let shippingCost = needsShipping ? zone.baseCost : 0
  if (couponFreeShipping) shippingCost = 0
  if (needsShipping && settings.freeShippingThreshold > 0 && subtotal - promotionDiscount - couponDiscount >= settings.freeShippingThreshold) {
    shippingCost = 0
  }

  const preCreditTotal = Math.max(0, subtotal - promotionDiscount - couponDiscount + shippingCost)

  // Crédit boutique (portefeuille client, dépense FIFO sur récompenses)
  const creditUsed = user && input.useCredit ? Math.min(user.storeCredit, preCreditTotal) : 0
  const total = preCreditTotal - creditUsed

  const orderNumber = generateOrderNumber()
  const accessToken = randomBytes(16).toString("hex")
  const promotionsSnapshot = cartCookie.promotions.map((p) => ({
    promotionId: p.promotionId,
    name: p.name,
    amount: p.amount,
    description: p.description,
  }))

  // ---- Construction des lignes + opérations de stock (dédupliquées) ----
  const itemsData: Prisma.OrderItemCreateManyInput[] = []
  // Décréments atomiques agrégés par cible (plus strict que les lectures
  // préalables : le test stock >= qté et le décrément sont UNE seule requête).
  const variantDecrements = new Map<string, { qty: number; name: string }>()
  const productDecrements = new Map<string, { qty: number; name: string; salesCount: number }>()
  const salesOnly = new Map<string, number>()

  // Produits des lignes promotionnelles (offertes/remisées) : il faut leur
  // type/inventaire pour décider entre décrément de stock (physique suivi) et
  // simple compteur de ventes (numérique ou stock non suivi). SANS cette
  // distinction, un produit NUMÉRIQUE à « stock 0 » (non tracé) bloquait tout
  // le checkout alors qu'il est disponible à l'infini (bug réel observé :
  // promotion « Pack Canva à -40 % » avec Pack 150 numérique en stock 0).
  const extraLineIds = [
    ...cartCookie.promotions.flatMap((p) =>
      p.freeLine ? [p.freeLine.productId] : p.discountedLine ? [p.discountedLine.productId] : [],
    ),
    ...(cartCookie.coupon?.freeLine ? [cartCookie.coupon.freeLine.productId] : []),
  ]
  // Seuls les produits physiques À STOCK SUIVI participent au décrément ;
  // les numériques (et non suivis) ne décomptent que les ventes.
  const extraPhysicalTracked = new Set(
    extraLineIds.length > 0
      ? (
          await db.product.findMany({
            where: { id: { in: extraLineIds }, type: { not: "DIGITAL" }, trackInventory: true },
            select: { id: true },
          })
        ).map((p) => p.id)
      : [],
  )

  for (const line of cartCookie.lines) {
    itemsData.push({
      orderId: "", // renseigné après création de la commande
      productId: line.product.id,
      variantId: line.variant?.id ?? null,
      variantName: line.variant?.name ?? null,
      productName: line.product.name,
      productSlug: line.product.slug,
      sku: line.variant?.sku ?? line.product.sku ?? null,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
    })
    if (line.product.type !== "DIGITAL" && line.product.trackInventory) {
      if (line.variant) {
        const cur = variantDecrements.get(line.variant.id) ?? { qty: 0, name: line.product.name }
        variantDecrements.set(line.variant.id, { qty: cur.qty + line.quantity, name: cur.name })
      } else {
        const cur = productDecrements.get(line.product.id) ?? { qty: 0, name: line.product.name, salesCount: 0 }
        productDecrements.set(line.product.id, {
          qty: cur.qty + line.quantity,
          name: cur.name,
          salesCount: cur.salesCount + line.quantity,
        })
      }
    } else {
      salesOnly.set(line.product.id, (salesOnly.get(line.product.id) ?? 0) + line.quantity)
    }
  }

  // Lignes supplémentaires (produits offerts / remisés par promotions et coupons)
  for (const p of cartCookie.promotions) {
    if (p.freeLine) {
      itemsData.push({
        orderId: "",
        productId: p.freeLine.productId,
        productName: p.freeLine.productName,
        productSlug: p.freeLine.productSlug,
        sku: p.freeLine.sku,
        unitPrice: p.freeLine.unitPrice,
        quantity: p.freeLine.quantity,
        lineTotal: 0,
        isFreeItem: true,
        promotionId: p.promotionId,
      })
      const cur = productDecrements.get(p.freeLine.productId) ?? { qty: 0, name: p.freeLine.productName, salesCount: 0 }
      if (extraPhysicalTracked.has(p.freeLine.productId)) {
        productDecrements.set(p.freeLine.productId, { ...cur, qty: cur.qty + p.freeLine.quantity })
      } else {
        salesOnly.set(p.freeLine.productId, (salesOnly.get(p.freeLine.productId) ?? 0) + p.freeLine.quantity)
      }
    } else if (p.discountedLine) {
      const dl = p.discountedLine
      itemsData.push({
        orderId: "",
        productId: dl.productId,
        productName: dl.productName,
        productSlug: dl.productSlug,
        sku: dl.sku,
        unitPrice: dl.unitPrice,
        quantity: dl.quantity,
        lineTotal: Math.max(0, dl.unitPrice - dl.discountPerUnit) * dl.quantity,
        isFreeItem: false,
        promotionId: p.promotionId,
      })
      const cur = productDecrements.get(dl.productId) ?? { qty: 0, name: dl.productName, salesCount: 0 }
      if (extraPhysicalTracked.has(dl.productId)) {
        productDecrements.set(dl.productId, { ...cur, qty: cur.qty + dl.quantity })
      } else {
        salesOnly.set(dl.productId, (salesOnly.get(dl.productId) ?? 0) + dl.quantity)
      }
    }
  }
  if (cartCookie.coupon?.freeLine) {
    const fl = cartCookie.coupon.freeLine
    itemsData.push({
      orderId: "",
      productId: fl.productId,
      productName: fl.productName,
      productSlug: fl.productSlug,
      sku: fl.sku,
      unitPrice: fl.unitPrice,
      quantity: fl.quantity,
      lineTotal: 0,
      isFreeItem: true,
    })
    const cur = productDecrements.get(fl.productId) ?? { qty: 0, name: fl.productName, salesCount: 0 }
    if (extraPhysicalTracked.has(fl.productId)) {
      productDecrements.set(fl.productId, { ...cur, qty: cur.qty + fl.quantity })
    } else {
      salesOnly.set(fl.productId, (salesOnly.get(fl.productId) ?? 0) + fl.quantity)
    }
  }

  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        accessToken,
        userId: user?.id ?? null,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        address: input.address,
        city: input.city,
        shippingZoneId: zone.id,
        shippingZoneName: zone.name,
        shippingCost,
        deliveryNote: input.deliveryNote ?? null,
        subtotal,
        couponId: cartCookie.coupon?.couponId ?? null,
        couponCode: cartCookie.coupon?.code ?? null,
        couponDiscount,
        promotionDiscount,
        promotionsJson: JSON.stringify(promotionsSnapshot),
        creditUsed,
        total,
        amountPaid: 0,
        paymentMethodId: method.id,
        paymentMethodCode: method.code,
        paymentMethodLabel: method.name,
        referrerId: user?.referredById ?? null,
        orderStatus: "PENDING",
        paymentStatus: "PAYMENT_PENDING",
      },
    })

    // Toutes les lignes en UNE requête (createMany)
    if (itemsData.length > 0) {
      await tx.orderItem.createMany({
        data: itemsData.map((it) => ({ ...it, orderId: created.id })),
      })
    }

    // Décréments de stock ATOMIQUES — UNE SEULE instruction SQL brute par
    // cible (UPDATE ... FROM VALUES) au lieu d'une requête Prisma par produit :
    // une transaction interactive = UNE connexion, chaque instruction coûte
    // un aller-retour (~250 ms vers Supabase) → regrouper = diviser le temps.
    // La condition stock >= qté fait office de vérification : ligne non touchée
    // → rowCount insuffisant → ApiError → ROLLBACK complet de la transaction.
    if (productDecrements.size > 0) {
      const rows = [...productDecrements.entries()].map(
        ([id, op]) => Prisma.sql`(${id}::text, ${op.qty}::int, ${op.salesCount}::int)`,
      )
      const updated = await tx.$executeRaw`
        UPDATE "Product" AS p
        SET stock = p.stock - v.qty, "salesCount" = p."salesCount" + v.sales
        FROM (VALUES ${Prisma.join(rows)}) AS v(id, qty, sales)
        WHERE p.id = v.id AND p.stock >= v.qty AND p."trackInventory" = true AND p.type <> 'DIGITAL'
      `
      if (updated < productDecrements.size) {
        const failed = [...productDecrements.values()].find(() => true)!
        throw new ApiError(`Stock insuffisant pour « ${failed.name} ».`, 409)
      }
    }
    if (variantDecrements.size > 0) {
      const rows = [...variantDecrements.entries()].map(
        ([id, op]) => Prisma.sql`(${id}::text, ${op.qty}::int)`,
      )
      const updated = await tx.$executeRaw`
        UPDATE "ProductVariant" AS pv
        SET stock = pv.stock - v.qty
        FROM (VALUES ${Prisma.join(rows)}) AS v(id, qty)
        WHERE pv.id = v.id AND pv.stock >= v.qty
      `
      if (updated < variantDecrements.size) {
        const failed = [...variantDecrements.values()].find(() => true)!
        throw new ApiError(`Stock insuffisant pour « ${failed.name} ».`, 409)
      }
    }
    if (salesOnly.size > 0) {
      const rows = [...salesOnly.entries()].map(([id, qty]) => Prisma.sql`(${id}::text, ${qty}::int)`)
      await tx.$executeRaw`
        UPDATE "Product" AS p
        SET "salesCount" = p."salesCount" + v.qty
        FROM (VALUES ${Prisma.join(rows)}) AS v(id, qty)
        WHERE p.id = v.id
      `
    }

    // Coupon : utilisation + rachat + limites promotions (1 requête Prisma
    // par écriture — tables différentes impossibles à fusionner, MAIS les
    // compteurs de promotions fusionnent en UNE instruction).
    if (cartCookie.coupon) {
      await tx.coupon.update({ where: { id: cartCookie.coupon.couponId }, data: { usedCount: { increment: 1 } } })
      await tx.couponRedemption.create({
        data: {
          couponId: cartCookie.coupon.couponId,
          userId: user?.id ?? null,
          orderId: created.id,
        },
      })
    }
    const promoIds = [...new Set(cartCookie.promotions.map((p) => p.promotionId))]
    if (promoIds.length > 0) {
      await tx.promotion.updateMany({
        where: { id: { in: promoIds } },
        data: { usedCount: { increment: 1 } },
      })
    }

    // Crédit boutique : débit + récompenses marquées utilisées (FIFO)
    if (creditUsed > 0 && user) {
      // DÉCRÉMENT ATOMIQUE conditionnel (anti double-dépense / TOCTOU) :
      // le solde lu au calcul du panier peut être périmé si un autre
      // checkout a eu lieu entre-temps — la mise à jour ne réussit que si
      // le solde en base couvre toujours le crédit demandé, sinon rollback.
      const debited = await tx.user.updateMany({
        where: { id: user.id, storeCredit: { gte: creditUsed } },
        data: { storeCredit: { decrement: creditUsed } },
      })
      if (debited.count === 0) {
        throw new ApiError("Crédit boutique insuffisant — la commande a été refusée, rafraîchissez la page.", 409)
      }
      // Solde réel APRÈS décrément (source unique de vérité pour le journal).
      const freshUser = await tx.user.findUnique({ where: { id: user.id }, select: { storeCredit: true } })
      const finalBalance = freshUser?.storeCredit ?? 0
      await tx.creditTransaction.create({
        data: {
          userId: user.id,
          amount: -creditUsed,
          type: "SPEND",
          description: `Dépense du crédit boutique sur la commande ${orderNumber}`,
          balanceAfter: finalBalance,
          orderId: created.id,
        },
      })
      // Marquer les récompenses disponibles comme utilisées, FIFO
      const availableRewards = await tx.reward.findMany({
        where: { beneficiaryId: user.id, status: "REWARD_AVAILABLE" },
        orderBy: { approvedAt: "asc" },
      })
      let remaining = creditUsed
      const usedRewardIds: string[] = []
      for (const reward of availableRewards) {
        if (remaining <= 0) break
        usedRewardIds.push(reward.id)
        remaining -= reward.amount
      }
      if (usedRewardIds.length > 0) {
        await tx.reward.updateMany({
          where: { id: { in: usedRewardIds } },
          data: { status: "REWARD_USED", usedAt: new Date() },
        })
      }
    }

    // Paiement en attente + panier converti (2 écritures indispensables —
    // l'événement « created » sort de la transaction : pure donnée
    // d'affichage, écrite en parallèle après le commit).
    await tx.payment.create({
      data: {
        orderId: created.id,
        provider: method.code,
        methodLabel: method.name,
        amount: total,
        status: "PAYMENT_PENDING",
      },
    })
    await tx.cart.update({
      where: { id: cart.id },
      data: { status: "CONVERTED", convertedOrderId: created.id },
    })

    return created
  })

  // Événement « created » + journal : hors transaction, FIRE-AND-FORGET en
  // parallèle (données d'affichage/suivi — la commande est déjà créée,
  // validée et le client reçoit sa confirmation SANS attendre ces écritures).
  void Promise.all([
    db.orderEvent.create({
      data: {
        orderId: order.id,
        type: "created",
        message: `Commande créée (${formatXOF(total)}) — paiement à régler via ${method.name}.`,
        actorName: input.customerName,
        metadataJson: JSON.stringify({ zone: zone.name, shippingCost, creditUsed }),
      },
    }).catch(() => undefined),
    logActivity({
      actor: user ? { id: user.id, name: user.name, role: user.role } : null,
      action: "order.create",
      entityType: "order",
      entityId: order.id,
      details: { orderNumber, total },
    }).catch(() => undefined),
  ])

  // Stock + compteurs de ventes décrémentés en transaction : le catalogue
  // storefront (cache mémoire) et les fiches produits doivent être rafraîchis.
  // Les compteurs d'usage coupon/promotion consommés par la commande le sont
  // aussi (les caches 30 s ne doivent jamais dépasser les limites réelles).
  invalidateCache("catalog")
  invalidateCache("product:")
  invalidateCache("catalog:coupon:")
  invalidateCache("promotions:")
  // Nouvelle commande : les tableaux de bord admin la montrent imm00e9diatement
  // (stocks d00e9cr00e9ment00e9s 2192 listes produits + inventaire rafra00eechis aussi)
  invalidateCache("admin:orders")
  invalidateCache("admin:dashboard")
  invalidateCache("admin:customers")
  invalidateCache("admin:analytics")
  invalidateCache("admin:products")
  invalidateCache("admin:inventory")

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    accessToken: order.accessToken,
    alreadyExisting: false,
    order: {
      orderNumber: order.orderNumber,
      total,
      paymentMethodLabel: method.name,
      orderStatus: "PENDING",
      paymentStatus: "PAYMENT_PENDING",
    },
  }
}

/**
 * CONFIRMATION DE PAIEMENT — la seule porte qui débloque :
 *  - statut PAYMENT_PAID,
 *  - l'accès aux fichiers numériques (grants),
 *  - le traitement des récompenses parrainage.
 * Idempotent. Journalise qui a confirmé.
 */
export async function confirmPayment(orderId: string, actor: Actor, options?: { reference?: string; source?: string }): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, payments: true } })
  if (!order) throw new ApiError("Commande introuvable.", 404)
  if (order.paymentStatus === "PAYMENT_PAID") return // idempotent

  await db.$transaction(async (tx) => {
    // FLUIDITÉ : paiements + commande + événement en UNE salve parallèle
    await Promise.all([
      ...order.payments
        .filter((p) => p.status === "PAYMENT_PENDING")
        .map((payment) =>
          tx.payment.update({
            where: { id: payment.id },
            data: {
              status: "PAYMENT_PAID",
              confirmedAt: new Date(),
              confirmedBy: actor?.name ?? "Système",
              reference: options?.reference ?? payment.reference,
            },
          }),
        ),
      tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "PAYMENT_PAID",
          orderStatus: order.orderStatus === "PENDING" ? "CONFIRMED" : order.orderStatus,
          amountPaid: order.total,
          paidAt: new Date(),
          confirmedAt: new Date(),
        },
      }),
      tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "payment_confirmed",
          message: `Paiement confirmé (${formatXOF(order.total)}) — ${options?.source === "webhook" ? "webhook vérifié" : "confirmation manuelle par " + (actor?.name ?? "admin")}.`,
          actorName: actor?.name ?? "Système",
        },
      }),
    ])

    // Fichiers numériques : débloqués SEULEMENT après paiement confirmé.
    // FLUIDITÉ : UNE lecture produits pour toutes les lignes (au lieu de N
    // findUnique séquentiels), puis grants + flags en UNE salve parallèle.
    const productIds = [...new Set(order.items.map((i) => i.productId))]
    const products = await tx.product.findMany({ where: { id: { in: productIds } } })
    const productById = new Map(products.map((p) => [p.id, p]))
    const digitalItems = order.items.filter((item) => {
      const product = productById.get(item.productId)
      return product && (product.type === "DIGITAL" || product.type === "HYBRID") && !!product.digitalFileUrl
    })
    if (digitalItems.length > 0) {
      if (order.userId) {
        for (const item of digitalItems) {
          const product = productById.get(item.productId)!
          await tx.digitalDownloadGrant.upsert({
            where: { orderItemId_userId: { orderItemId: item.id, userId: order.userId } },
            update: {},
            create: {
              orderItemId: item.id,
              userId: order.userId,
              limitCount: product.digitalDownloadLimit,
            },
          })
        }
      }
      // Tous les flags digitalGranted en UNE instruction (au lieu de N)
      await tx.orderItem.updateMany({
        where: { id: { in: digitalItems.map((i) => i.id) } },
        data: { digitalGranted: true },
      })
    }
  })

  // Journal : fire-and-forget (affichage/suivi — ne retarde pas la réponse admin)
  void logActivity({
    actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : null,
    action: "order.confirm_payment",
    entityType: "order",
    entityId: order.id,
    details: { orderNumber: order.orderNumber, source: options?.source ?? "manual" },
  }).catch(() => undefined)

  // Récompenses parrainage (idempotentes par uniqueKey) — indépendantes → 1 salve
  await Promise.all([processCommissionRewardForOrder(order.id), processFullRefundRewardForOrder(order.id)])
}

/** Paiement échoué (fournisseur en ligne). Annule la commande si pas d'autre tentative. */
export async function markPaymentFailed(orderId: string, reason: string, actor: Actor): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) return
  if (order.paymentStatus === "PAYMENT_PAID") return

  await db.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { orderId, status: "PAYMENT_PENDING" },
      data: { status: "PAYMENT_FAILED", failureReason: reason },
    })
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: "PAYMENT_FAILED" } })
    await tx.orderEvent.create({
      data: { orderId, type: "payment_failed", message: `Paiement échoué : ${reason}`, actorName: actor?.name ?? "Fournisseur" },
    })
  })
}

export async function cancelOrder(orderId: string, reason: string, actor: Actor): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order) throw new ApiError("Commande introuvable.", 404)
  if (["CANCELLED", "REFUNDED"].includes(order.orderStatus)) return

  const wasPaid = order.paymentStatus === "PAYMENT_PAID"

  await db.$transaction(async (tx) => {
    // Restitution du stock physique
    for (const item of order.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } })
      if (!product) continue
      if (!item.isFreeItem && product.type !== "DIGITAL" && product.trackInventory) {
        if (item.variantId) {
          await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } })
        } else {
          await tx.product.update({
            where: { id: product.id },
            data: { stock: { increment: item.quantity }, salesCount: { decrement: item.quantity } },
          })
        }
      }
    }
    // Révocation des accès numériques
    await tx.digitalDownloadGrant.updateMany({
      where: { orderItemId: { in: order.items.map((i) => i.id) } },
      data: { revoked: true, revokedReason: `Commande annulée : ${reason}` },
    })
    await tx.payment.updateMany({
      where: { orderId, status: "PAYMENT_PENDING" },
      data: { status: "PAYMENT_CANCELLED" },
    })
    await tx.order.update({
      where: { id: orderId },
      data: {
        orderStatus: "CANCELLED",
        paymentStatus: wasPaid ? order.paymentStatus : "PAYMENT_CANCELLED",
        cancelledAt: new Date(),
        cancelledReason: reason,
      },
    })
    await tx.orderEvent.create({
      data: { orderId, type: "cancelled", message: `Commande annulée : ${reason}`, actorName: actor?.name ?? "Système" },
    })
  })

  // Suspension des récompenses liées (anti-fraude : commande annulée → pas de récompense)
  await cancelRewardsForOrder(orderId, `Commande annulée : ${reason}`)

  await logActivity({
    actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : null,
    action: "order.cancel",
    entityType: "order",
    entityId: orderId,
    details: { orderNumber: order.orderNumber, reason },
  })
}

export async function transitionOrderStatus(orderId: string, newStatus: string, actor: Actor, options?: { trackingNumber?: string }): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) throw new ApiError("Commande introuvable.", 404)

  const allowed: Record<string, string[]> = {
    PENDING: ["CONFIRMED", "PROCESSING", "CANCELLED"],
    CONFIRMED: ["PROCESSING", "SHIPPED", "CANCELLED"],
    PROCESSING: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED", "CANCELLED"],
    DELIVERED: [],
    CANCELLED: [],
    REFUNDED: [],
  }
  if (!allowed[order.orderStatus]?.includes(newStatus)) {
    throw new ApiError(`Transition de statut impossible : ${order.orderStatus} → ${newStatus}.`, 409)
  }

  const data: Record<string, unknown> = { orderStatus: newStatus }
  if (newStatus === "SHIPPED") {
    data.shippedAt = new Date()
    data.trackingNumber = options?.trackingNumber ?? order.trackingNumber
  }
  if (newStatus === "DELIVERED") {
    data.deliveredAt = new Date()
    // Paiement à la livraison : confirmation automatique du paiement à la livraison effective
    if (order.paymentMethodCode === "cash_on_delivery" && order.paymentStatus !== "PAYMENT_PAID") {
      await confirmPayment(orderId, { id: "system-delivery", name: "Livraison", role: "SYSTEM" }, { source: "delivery" })
    }
  }
  if (newStatus === "CANCELLED") {
    return cancelOrder(orderId, "Annulation admin", actor)
  }

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data })
    await tx.orderEvent.create({
      data: {
        orderId,
        type: newStatus.toLowerCase(),
        message: `Statut mis à jour : ${newStatus}.`,
        actorName: actor?.name ?? "Système",
        metadataJson: JSON.stringify(options ?? {}),
      },
    })
  })

  await logActivity({
    actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : null,
    action: `order.status.${newStatus.toLowerCase()}`,
    entityType: "order",
    entityId: orderId,
  })
}

/**
 * REMBOURSEMENT — crédit boutique (automatique, journalisé) ou remboursement
 * manuel (extérieur ; seul un humain autorisé le marque comme effectué).
 * Une commande source annulée/remboursée suspend les récompenses associées.
 */
export async function refundOrder(
  orderId: string,
  params: { amount: number; mode: "STORE_CREDIT" | "MANUAL"; reason: string; note?: string },
  actor: Actor,
): Promise<{ refundId: string }> {
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) throw new ApiError("Commande introuvable.", 404)
  if (order.paymentStatus !== "PAYMENT_PAID" && order.paymentStatus !== "PAYMENT_PARTIALLY_REFUNDED") {
    throw new ApiError("Seule une commande payée peut être remboursée.", 409)
  }
  const maxRefundable = order.amountPaid - order.amountRefunded
  if (params.amount <= 0 || params.amount > maxRefundable) {
    throw new ApiError(`Montant remboursable maximum : ${formatXOF(maxRefundable)}.`, 409)
  }

  const isFull = params.amount >= maxRefundable

  const refund = await db.$transaction(async (tx) => {
    const created = await tx.refund.create({
      data: {
        orderId,
        amount: params.amount,
        mode: params.mode,
        status: params.mode === "STORE_CREDIT" ? "PROCESSED" : "PENDING",
        reason: params.reason,
        note: params.note,
        createdById: actor?.id,
        processedAt: params.mode === "STORE_CREDIT" ? new Date() : null,
      },
    })

    if (params.mode === "STORE_CREDIT" && order.userId) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } })
      const balanceAfter = user.storeCredit + params.amount
      await tx.user.update({ where: { id: user.id }, data: { storeCredit: balanceAfter } })
      await tx.creditTransaction.create({
        data: {
          userId: user.id,
          amount: params.amount,
          type: "REFUND",
          description: `Remboursement de la commande ${order.orderNumber} : ${params.reason}`,
          balanceAfter,
          orderId,
        },
      })
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        amountRefunded: { increment: params.amount },
        paymentStatus: isFull ? "PAYMENT_REFUNDED" : "PAYMENT_PARTIALLY_REFUNDED",
        orderStatus: isFull ? "REFUNDED" : order.orderStatus,
      },
    })
    await tx.orderEvent.create({
      data: {
        orderId,
        type: "refunded",
        message: `Remboursement ${isFull ? "intégral" : "partiel"} de ${formatXOF(params.amount)} (${params.mode === "STORE_CREDIT" ? "crédit boutique" : "remboursement manuel à effectuer"}). Motif : ${params.reason}`,
        actorName: actor?.name ?? "Système",
      },
    })
    return created
  })

  if (isFull) {
    // Réversibilité : une commande entièrement remboursée annule accès et récompenses
    const items = await db.orderItem.findMany({ where: { orderId } })
    await db.digitalDownloadGrant.updateMany({
      where: { orderItemId: { in: items.map((i) => i.id) } },
      data: { revoked: true, revokedReason: "Commande remboursée" },
    })
    await cancelRewardsForOrder(orderId, "Commande remboursée")
  }

  await logActivity({
    actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : null,
    action: "order.refund",
    entityType: "order",
    entityId: orderId,
    details: { amount: params.amount, mode: params.mode },
  })

  return { refundId: refund.id }
}

/** Un remboursement "MANUEL" est marqué effectué par un admin autorisé (jamais automatique). */
export async function markRefundProcessed(refundId: string, actor: Actor): Promise<void> {
  const refund = await db.refund.findUnique({ where: { id: refundId } })
  if (!refund) throw new ApiError("Remboursement introuvable.", 404)
  if (refund.status === "PROCESSED") return
  await db.refund.update({ where: { id: refundId }, data: { status: "PROCESSED", processedAt: new Date() } })
  await db.orderEvent.create({
    data: {
      orderId: refund.orderId,
      type: "refund_processed",
      message: `Remboursement de ${formatXOF(refund.amount)} confirmé comme effectué (externe) par ${actor?.name}.`,
      actorName: actor?.name ?? "Admin",
    },
  })
  await logActivity({
    actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : null,
    action: "refund.processed",
    entityType: "refund",
    entityId: refundId,
  })
}
