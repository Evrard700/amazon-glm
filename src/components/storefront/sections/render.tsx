// ============================================================================
// RENDU PUBLIC DES SECTIONS — server component (accès DB autorisé).
// Consommé par src/app/(storefront)/page.tsx et src/app/(storefront)/pages/[slug].
// Le registre éditeur (client, sans DB) vit dans ./registry.tsx.
// ============================================================================
import type { ReactNode } from "react"
import type { PageSectionData } from "./registry"
import { HeroSection } from "./hero"
import { UspBarSection } from "./usp-bar"
import { CategoriesSection } from "./categories"
import { ProductGridSection } from "./product-grid"
import { PromoBannerSection } from "./promo-banner"
import { CollectionHighlightSection } from "./collection-highlight"
import { TestimonialsSection } from "./testimonials"
import { FaqSection } from "./faq"
import { RichTextSection } from "./rich-text"
import { VideoSection } from "./video"
import { CountdownSection } from "./countdown"
import { LogosSection } from "./logos"
import { ReviewsSection } from "./reviews"
import { NewsletterSection } from "./newsletter"
import { SeoTextSection } from "./seo-text"

export type { PageSectionData } from "./registry"

/** Parse le JSON publié d'une Page → sections valides ({ sections: [...] }). */
export function parsePublishedSections(raw: string | null | undefined): PageSectionData[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { sections?: unknown }).sections)) {
      return []
    }
    return (parsed as { sections: unknown[] }).sections.filter(
      (s): s is PageSectionData =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as { type?: unknown }).type === "string" &&
        (s as { id?: unknown }).id != null,
    )
  } catch {
    return []
  }
}

/** Rend une section publiée (switch sur le type). Retourne null pour un type inconnu. */
export async function renderSection(section: PageSectionData): Promise<ReactNode> {
  const props: Record<string, unknown> =
    section.props && typeof section.props === "object" ? section.props : {}

  switch (section.type) {
    case "hero":
      return <HeroSection props={props} />
    case "usp-bar":
      return <UspBarSection props={props} />
    case "categories":
      return <CategoriesSection props={props} />
    case "product-grid":
      return <ProductGridSection props={props} />
    case "promo-banner":
      return <PromoBannerSection props={props} />
    case "collection-highlight":
      return <CollectionHighlightSection props={props} />
    case "testimonials":
      return <TestimonialsSection props={props} />
    case "faq":
      return <FaqSection props={props} />
    case "rich-text":
      return <RichTextSection props={props} />
    case "video":
      return <VideoSection props={props} />
    case "countdown":
      return <CountdownSection props={props} />
    case "logos":
      return <LogosSection props={props} />
    case "reviews":
      return <ReviewsSection props={props} />
    case "newsletter":
      return <NewsletterSection props={props} />
    case "seo-text":
      return <SeoTextSection props={props} />
    default:
      console.warn(`[sections] type inconnu : ${section.type}`)
      return null
  }
}
