"use client"

// ============================================================================
// REGISTRE DES SECTIONS (client) — consommé par l'éditeur visuel (Task 4).
// Les DÉFINITIONS serveur-safe vivent dans ./section-defs.ts ; ce module y
// attache les composants d'aperçu pour le canvas de l'éditeur.
// ============================================================================

import type { ComponentType } from "react"
import {
  HeroPreview,
  UspBarPreview,
  CategoriesPreview,
  ProductGridPreview,
  PromoBannerPreview,
  CollectionHighlightPreview,
  TestimonialsPreview,
  FaqPreview,
  RichTextPreview,
  VideoPreview,
  CountdownPreview,
  LogosPreview,
  ReviewsPreview,
  NewsletterPreview,
  SeoTextPreview,
} from "./previews"
import { SECTION_DEFS, type SectionTypeDef as BaseSectionTypeDef } from "./section-defs"

export type {
  PageSectionData,
  SectionField,
  SectionItemField,
  FieldOption,
} from "./section-defs"

/** Définition complète (client) : déf + composant d'aperçu pour l'éditeur. */
export interface SectionTypeDef extends BaseSectionTypeDef {
  /** Aperçu statique (client, sans DB) pour le canvas de l'éditeur. */
  preview: ComponentType<{ props: Record<string, unknown> }>
}

const PREVIEWS: Record<string, ComponentType<{ props: Record<string, unknown> }>> = {
  hero: HeroPreview,
  "usp-bar": UspBarPreview,
  categories: CategoriesPreview,
  "product-grid": ProductGridPreview,
  "promo-banner": PromoBannerPreview,
  "collection-highlight": CollectionHighlightPreview,
  testimonials: TestimonialsPreview,
  faq: FaqPreview,
  "rich-text": RichTextPreview,
  video: VideoPreview,
  countdown: CountdownPreview,
  logos: LogosPreview,
  reviews: ReviewsPreview,
  newsletter: NewsletterPreview,
  "seo-text": SeoTextPreview,
}

export const SECTION_TYPES: SectionTypeDef[] = SECTION_DEFS.map((def) => ({
  ...def,
  preview: PREVIEWS[def.type] ?? SeoTextPreview,
}))

export function sectionDefaultProps(type: string): Record<string, unknown> {
  const def = SECTION_TYPES.find((s) => s.type === type)
  if (!def) return {}
  return JSON.parse(JSON.stringify(def.defaults)) as Record<string, unknown>
}

export function sectionTypeDef(type: string): SectionTypeDef | undefined {
  return SECTION_TYPES.find((s) => s.type === type)
}
