import { z } from "zod"
import {
  COUPON_TYPES,
  PROMOTION_RULES,
  UPSALE_TRIGGER_TYPES,
  REWARD_MODES,
} from "@/lib/constants"
import { CAMPAIGN_SEGMENTS as CAMPAIGN_SEGMENT_KEYS } from "./helpers"

/**
 * Schémas Zod partagés par les routes marketing (création ET mise à jour).
 * SQLite n'a pas d'enum : les listes font foi (validées strictement ici).
 */

/** Champ date optionnel : chaîne datetime-local → Date | null. */
export const optionalDate = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) => v === null || v === undefined || v === "" || !Number.isNaN(new Date(v).getTime()),
    "Date invalide (format attendu : AAAA-MM-JJ HH:MM).",
  )
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null
    return new Date(v as string)
  })

export const SCOPE_TYPES = ["ALL", "PRODUCTS", "CATEGORIES"] as const

const idList = z.array(z.string().min(1)).max(100)

// ---------- Coupons ----------
const couponObject = z.object({
    code: z
      .string()
      .trim()
      .min(3, "Le code doit contenir au moins 3 caractères.")
      .max(30, "Le code ne peut pas dépasser 30 caractères.")
      .regex(
        /^[A-Za-z0-9-]+$/,
        "Le code ne peut contenir que des lettres, chiffres et tirets.",
      )
      .transform((v) => v.toUpperCase()),
    type: z.enum(COUPON_TYPES),
    value: z.coerce.number().int("Montant entier en FCFA requis.").min(0).max(100_000_000),
    description: z.string().trim().max(500).nullable().optional(),
    appliesTo: z.enum(SCOPE_TYPES),
    productIds: idList.default([]),
    categoryIds: idList.default([]),
    minOrderAmount: z.coerce.number().int().min(0).max(100_000_000).default(0),
    maxUses: z.coerce.number().int().min(1, "Au moins 1 utilisation.").max(1_000_000).nullable().default(null),
    perCustomerLimit: z.coerce.number().int().min(0, "0 = illimité par client.").max(1000).default(1),
    freeProductId: z.string().nullable().optional(),
    startsAt: optionalDate,
    expiresAt: optionalDate,
    isActive: z.boolean().default(true),
    userId: z.string().nullable().optional(),
  })

export const couponSchema = couponObject.superRefine((data, ctx) => {
    if (data.type === "PERCENT" && (data.value < 1 || data.value > 100)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Un pourcentage doit être compris entre 1 et 100.",
      })
    }
    if (data.type === "FIXED" && data.value <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Un montant fixe doit être supérieur à 0 FCFA.",
      })
    }
    if (data.type === "FREE_PRODUCT" && !data.freeProductId) {
      ctx.addIssue({
        code: "custom",
        path: ["freeProductId"],
        message: "Choisissez le produit offert pour ce code promo.",
      })
    }
    if (data.appliesTo === "PRODUCTS" && data.productIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["productIds"],
        message: "Sélectionnez au moins un produit concerné.",
      })
    }
    if (data.appliesTo === "CATEGORIES" && data.categoryIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryIds"],
        message: "Sélectionnez au moins une catégorie concernée.",
      })
    }
    if (data.startsAt && data.expiresAt && data.expiresAt <= data.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "La date de fin doit être postérieure à la date de début.",
      })
    }
  })

/**
 * Variante PATCH (mise à jour partielle) — champs tous optionnels.
 * ⚠️ `.partial()` doit s'appliquer à l'objet BRUT : Zod interdit
 * `.partial()` sur un schéma déjà raffiné (.superRefine) — crash au build.
 */
export const partialCouponSchema = couponObject.partial().superRefine((data, ctx) => {
  if (data.type === "PERCENT" && data.value !== undefined && (data.value < 1 || data.value > 100)) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: "Un pourcentage doit être compris entre 1 et 100.",
    })
  }
  if (data.type === "FIXED" && data.value !== undefined && data.value <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: "Un montant fixe doit être supérieur à 0 FCFA.",
    })
  }
  if (data.type === "FREE_PRODUCT" && data.freeProductId !== undefined && !data.freeProductId) {
    ctx.addIssue({
      code: "custom",
      path: ["freeProductId"],
      message: "Choisissez le produit offert pour ce code promo.",
    })
  }
  if (data.appliesTo === "PRODUCTS" && data.productIds !== undefined && data.productIds.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["productIds"],
      message: "Sélectionnez au moins un produit concerné.",
    })
  }
  if (data.appliesTo === "CATEGORIES" && data.categoryIds !== undefined && data.categoryIds.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["categoryIds"],
      message: "Sélectionnez au moins une catégorie concernée.",
    })
  }
  if (data.startsAt && data.expiresAt && data.expiresAt <= data.startsAt) {
    ctx.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "La date de fin doit être postérieure à la date de début.",
    })
  }
})

// ---------- Promotions BXGY ----------
const promotionObject = z.object({
    name: z.string().trim().min(3, "Nom requis (3 caractères minimum).").max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    ruleType: z.enum(PROMOTION_RULES),
    requiredQty: z.coerce.number().int().min(1, "Au moins 1 article requis.").max(100),
    rewardQty: z.coerce.number().int().min(1, "Au moins 1 article offert.").max(100),
    rewardProductId: z.string().nullable().optional(),
    discountPercent: z.coerce.number().int().min(1, "Entre 1 et 100.").max(100).nullable().optional(),
    appliesTo: z.enum(SCOPE_TYPES),
    productIds: idList.default([]),
    categoryIds: idList.default([]),
    minOrderAmount: z.coerce.number().int().min(0).max(100_000_000).default(0),
    priority: z.coerce.number().int().min(0).max(1000).default(0),
    combinable: z.boolean().default(true),
    badgeLabel: z.string().trim().max(60).nullable().optional(),
    startsAt: optionalDate,
    endsAt: optionalDate,
    maxUses: z.coerce.number().int().min(1).max(1_000_000).nullable().default(null),
    perCustomerLimit: z.coerce.number().int().min(0, "0 = illimité par client.").max(1000).default(0),
    isActive: z.boolean().default(true),
  })

export const promotionSchema = promotionObject.superRefine((data, ctx) => {
    if (
      (data.ruleType === "BUY_X_GET_PRODUCT_FREE" || data.ruleType === "BUY_X_GET_PRODUCT_DISCOUNT") &&
      !data.rewardProductId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["rewardProductId"],
        message: "Choisissez le produit offert / à tarif réduit.",
      })
    }
    if (data.ruleType === "BUY_X_GET_PRODUCT_DISCOUNT" && (data.discountPercent === null || data.discountPercent === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["discountPercent"],
        message: "Précisez le pourcentage de réduction sur le produit proposé.",
      })
    }
    if (data.appliesTo === "PRODUCTS" && data.productIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["productIds"],
        message: "Sélectionnez au moins un produit déclencheur.",
      })
    }
    if (data.appliesTo === "CATEGORIES" && data.categoryIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["categoryIds"],
        message: "Sélectionnez au moins une catégorie déclencheuse.",
      })
    }
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "La date de fin doit être postérieure à la date de début.",
      })
    }
  })

/** Variante PATCH — cf. partialCouponSchema. */
export const partialPromotionSchema = promotionObject.partial().superRefine((data, ctx) => {
  if (
    (data.ruleType === "BUY_X_GET_PRODUCT_FREE" || data.ruleType === "BUY_X_GET_PRODUCT_DISCOUNT") &&
    data.rewardProductId !== undefined &&
    !data.rewardProductId
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["rewardProductId"],
      message: "Choisissez le produit offert / à tarif réduit.",
    })
  }
  if (
    data.ruleType === "BUY_X_GET_PRODUCT_DISCOUNT" &&
    data.discountPercent !== undefined &&
    data.discountPercent === null
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["discountPercent"],
      message: "Précisez le pourcentage de réduction sur le produit proposé.",
    })
  }
  if (data.appliesTo === "PRODUCTS" && data.productIds !== undefined && data.productIds.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["productIds"],
      message: "Sélectionnez au moins un produit déclencheur.",
    })
  }
  if (data.appliesTo === "CATEGORIES" && data.categoryIds !== undefined && data.categoryIds.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["categoryIds"],
      message: "Sélectionnez au moins une catégorie déclencheuse.",
    })
  }
  if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
    ctx.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "La date de fin doit être postérieure à la date de début.",
    })
  }
})

// ---------- Upsells ----------
const upsellObject = z.object({
    name: z.string().trim().min(3, "Nom requis (3 caractères minimum).").max(120),
    triggerType: z.enum(UPSALE_TRIGGER_TYPES),
    triggerProductIds: idList.default([]),
    triggerCategoryIds: idList.default([]),
    triggerMinAmount: z.coerce.number().int().min(0).max(100_000_000).default(0),
    offerProductId: z.string().min(1, "Choisissez le produit proposé."),
    specialPrice: z.coerce.number().int("Prix entier en FCFA requis.").min(0),
    message: z.string().trim().min(10, "Message commercial requis (10 caractères minimum).").max(1000),
    imageUrl: z.string().trim().max(600).nullable().optional(),
    startsAt: optionalDate,
    endsAt: optionalDate,
    isActive: z.boolean().default(true),
    maxAccepts: z.coerce.number().int().min(1).max(1_000_000).nullable().default(null),
    showOnThankYou: z.boolean().default(true),
    showInCart: z.boolean().default(false),
    position: z.coerce.number().int().min(0).max(999).default(0),
  })

export const upsellSchema = upsellObject.superRefine((data, ctx) => {
    if (data.triggerType === "PRODUCT" && data.triggerProductIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["triggerProductIds"],
        message: "Sélectionnez au moins un produit déclencheur.",
      })
    }
    if (data.triggerType === "CATEGORY" && data.triggerCategoryIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["triggerCategoryIds"],
        message: "Sélectionnez au moins une catégorie déclencheuse.",
      })
    }
    if (data.triggerType === "ORDER_AMOUNT" && data.triggerMinAmount <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["triggerMinAmount"],
        message: "Précisez le montant de commande déclencheur.",
      })
    }
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "La date de fin doit être postérieure à la date de début.",
      })
    }
  })

/** Variante PATCH — cf. partialCouponSchema. */
export const partialUpsellSchema = upsellObject.partial().superRefine((data, ctx) => {
  if (data.triggerType === "PRODUCT" && data.triggerProductIds !== undefined && data.triggerProductIds.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["triggerProductIds"],
      message: "Sélectionnez au moins un produit déclencheur.",
    })
  }
  if (data.triggerType === "CATEGORY" && data.triggerCategoryIds !== undefined && data.triggerCategoryIds.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["triggerCategoryIds"],
      message: "Sélectionnez au moins une catégorie déclencheuse.",
    })
  }
  if (data.triggerType === "ORDER_AMOUNT" && data.triggerMinAmount !== undefined && data.triggerMinAmount <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["triggerMinAmount"],
      message: "Précisez le montant de commande déclencheur.",
    })
  }
  if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
    ctx.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "La date de fin doit être postérieure à la date de début.",
    })
  }
})

// ---------- Campagnes ----------
const campaignObject = z.object({
    // Aucun statut DRAFT/SCHEDULED « actif » ici : sans fournisseur d'envoi configuré,
    // une campagne programmée n'enverra JAMAIS de message (bandeau honnête côté UI).
    name: z.string().trim().min(3, "Nom requis (3 caractères minimum).").max(120),
    channel: z.enum(["EMAIL", "WHATSAPP"]),
    subject: z.string().trim().min(3, "Objet requis.").max(160),
    content: z.string().trim().min(10, "Contenu requis (10 caractères minimum).").max(3000),
    segment: z.enum(CAMPAIGN_SEGMENT_KEYS),
    minOrders: z.coerce.number().int().min(1).max(1000).nullable().default(null),
    scheduledAt: optionalDate,
    note: z.string().trim().max(500).nullable().optional(),
  })

export const campaignSchema = campaignObject.superRefine((data, ctx) => {
    if (data.minOrders !== null && data.segment !== "CLIENTS_AVEC_COMMANDES") {
      ctx.addIssue({
        code: "custom",
        path: ["minOrders"],
        message: "Le nombre minimum de commandes ne s'applique qu'au segment « Clients avec commandes ».",
      })
    }
  })

/** Variante PATCH — cf. partialCouponSchema. */
export const partialCampaignSchema = campaignObject.partial().superRefine((data, ctx) => {
  if (
    data.minOrders !== null &&
    data.minOrders !== undefined &&
    data.segment !== undefined &&
    data.segment !== "CLIENTS_AVEC_COMMANDES"
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["minOrders"],
      message: "Le nombre minimum de commandes ne s'applique qu'au segment « Clients avec commandes ».",
    })
  }
})

// ---------- Programmes parrainage ----------
export const referralProgramSchema = z
  .object({
    isActive: z.boolean().optional(),
    name: z.string().trim().min(3).max(120).optional(),
    commissionType: z.enum(["PERCENT", "FIXED"]).optional(),
    commissionValue: z.coerce.number().int().min(1, "Valeur > 0 requis.").max(100_000_000).optional(),
    capPerReward: z.coerce.number().int().min(1).max(100_000_000).nullable().optional(),
    baseCalculation: z.enum(["SUBTOTAL"]).optional(),
    minOrderAmount: z.coerce.number().int().min(0).max(100_000_000).optional(),
    eligibleProductIds: idList.optional(),
    eligibleCategoryIds: idList.optional(),
    maxRewardsPerReferrer: z.coerce.number().int().min(1).max(10_000).nullable().optional(),
    maxReferralsPerReferrer: z.coerce.number().int().min(1).max(10_000).nullable().optional(),
    holdPeriodDays: z.coerce.number().int().min(0, "0 = crédit immédiat.").max(365).optional(),
    rewardMode: z.enum(REWARD_MODES).optional(),
    terms: z.string().trim().max(4000).nullable().optional(),
    startsAt: optionalDate,
    endsAt: optionalDate,
  })
  .superRefine((data, ctx) => {
    if (
      data.commissionType === "PERCENT" &&
      data.commissionValue !== undefined &&
      (data.commissionValue < 1 || data.commissionValue > 100)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["commissionValue"],
        message: "Un pourcentage de commission doit être compris entre 1 et 100.",
      })
    }
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "La date de fin doit être postérieure à la date de début.",
      })
    }
  })

export const fullRefundProgramSchema = z
  .object({
    isActive: z.boolean().optional(),
    name: z.string().trim().min(3).max(120).optional(),
    requiredReferrals: z.coerce.number().int().min(1, "Au moins 1 filleul requis.").max(1000).optional(),
    requiredPaidOrdersPerReferral: z.coerce.number().int().min(1).max(100).optional(),
    minOrderAmountPerReferral: z.coerce.number().int().min(0).max(100_000_000).optional(),
    eligibleProductIds: idList.optional(),
    eligibleCategoryIds: idList.optional(),
    minSourceOrderAmount: z.coerce.number().int().min(0).max(100_000_000).optional(),
    refundPercent: z.coerce.number().int().min(1, "Entre 1 et 100.").max(100).optional(),
    refundCap: z.coerce.number().int().min(1).max(100_000_000).nullable().optional(),
    maxRewards: z.coerce.number().int().min(1).max(10_000).nullable().optional(),
    holdPeriodDays: z.coerce.number().int().min(0).max(365).optional(),
    rewardMode: z.enum(REWARD_MODES).optional(),
    terms: z.string().trim().max(4000).nullable().optional(),
    startsAt: optionalDate,
    endsAt: optionalDate,
  })
  .superRefine((data, ctx) => {
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "La date de fin doit être postérieure à la date de début.",
      })
    }
  })

// ---------- Récompenses ----------
export const cancelRewardSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Précisez la raison de l'annulation (traçabilité exigée).")
    .max(500),
})
