import { ApiError } from "@/lib/api"
import { SECTION_DEFS, type PageSectionData } from "@/components/storefront/sections/section-defs"

/** Validation serveur de la structure des sections d'une page (brouillon ou publication). */
export function validateSections(payload: unknown): PageSectionData[] {
  const sections = Array.isArray(payload) ? (payload as PageSectionData[]) : []
  if (sections.length > 60) throw new ApiError("Trop de sections (60 max).", 422)
  const knownTypes = new Set(SECTION_DEFS.map((s) => s.type))
  for (const s of sections) {
    if (!s?.id || !s?.type || !knownTypes.has(s.type)) {
      throw new ApiError("Structure de section invalide (type inconnu).", 422)
    }
    if (s.props && JSON.stringify(s.props).length > 30_000) {
      throw new ApiError("Une section contient un contenu trop volumineux.", 422)
    }
  }
  return sections
}
