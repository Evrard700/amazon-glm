// Paramètres de catalogue — helpers purs partagés server ↔ client.
// Toutes les navigations de filtres passent par buildCatalogueUrl (préservation des params).

export const CATALOGUE_PAGE_SIZE = 24

export type CatalogueParams = Record<string, string | string[] | undefined>

export const SORT_OPTIONS = [
  { value: "popular", label: "Les plus populaires" },
  { value: "recent", label: "Nouveautés" },
  { value: "price-asc", label: "Prix croissant" },
  { value: "price-desc", label: "Prix décroissant" },
  { value: "rating", label: "Les mieux notés" },
] as const

export const TYPE_OPTIONS = [
  { value: "PHYSICAL", label: "Physiques" },
  { value: "DIGITAL", label: "Numériques" },
  { value: "HYBRID", label: "Hybrides" },
] as const

export const CATALOGUE_KEYS = [
  "q",
  "category",
  "collection",
  "type",
  "min",
  "max",
  "filter",
  "inStock",
  "sort",
  "page",
] as const

export function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/**
 * Construit une URL de catalogue : conserve les paramètres connus puis
 * applique les changements (valeur null = retire le paramètre).
 * `page` est retiré sauf si fourni explicitement (tout changement de filtre réinitialise la pagination).
 */
export function buildCatalogueUrl(
  basePath: string,
  params: CatalogueParams,
  changes: Record<string, string | null> = {},
): string {
  const sp = new URLSearchParams()
  for (const key of CATALOGUE_KEYS) {
    const raw = firstValue(params[key])
    if (raw) sp.set(key, raw)
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "") sp.delete(key)
    else sp.set(key, value)
  }
  if (!changes.hasOwnProperty("page")) sp.delete("page")
  const qs = sp.toString()
  return qs ? `${basePath}?${qs}` : basePath
}
