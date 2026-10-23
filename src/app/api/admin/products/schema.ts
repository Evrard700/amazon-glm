import { z } from "zod"

// Schémas de validation des produits (partagés entre routes admin).

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const productVariantSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  options: z.record(z.string(), z.string()).default({}),
  sku: z.string().max(60).optional().nullable(),
  price: z.number().int().min(0).nullable().optional(),
  stock: z.number().int().min(0).default(0),
  imageUrl: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
})

export const productSchema = z
  .object({
    name: z.string().min(2).max(160),
    slug: z.string().max(160).regex(slugRegex, "slug invalide (minuscules, chiffres et tirets)"),
    type: z.enum(["PHYSICAL", "DIGITAL", "HYBRID"]),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    description: z.string().min(1).max(8000),
    shortDescription: z.string().max(300).optional().nullable(),
    price: z.number().int().min(0),
    salePrice: z.number().int().min(0).nullable().optional(),
    sku: z.string().max(60).optional().nullable(),
    stock: z.number().int().min(0).default(0),
    trackInventory: z.boolean().default(true),
    images: z.array(z.string().min(4).max(600)).max(10).default([]),
    tags: z.array(z.string().min(1).max(40)).max(20).default([]),
    attributes: z
      .array(z.object({ name: z.string().min(1).max(60), values: z.array(z.string().min(1).max(60)).max(20) }))
      .max(10)
      .default([]),
    relatedIds: z.array(z.string()).max(20).default([]),
    categoryIds: z.array(z.string()).max(10).default([]),
    collectionIds: z.array(z.string()).max(10).default([]),
    requiresShipping: z.boolean().default(true),
    weightGrams: z.number().int().min(0).max(1_000_000).nullable().optional(),
    digitalFileName: z.string().max(200).optional().nullable(),
    digitalFileUrl: z.string().max(300).optional().nullable(),
    digitalDownloadLimit: z.number().int().min(0).max(100).default(5),
    variants: z.array(productVariantSchema).max(50).default([]),
  })
  .refine((d) => d.salePrice === null || d.salePrice === undefined || d.salePrice < d.price, {
    message: "Le prix promotionnel doit être inférieur au prix normal.",
    path: ["salePrice"],
  })
  .refine((d) => d.type !== "PHYSICAL" || d.requiresShipping, {
    message: "Un produit physique nécessite la livraison.",
    path: ["requiresShipping"],
  })

export const productPatchSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
})
