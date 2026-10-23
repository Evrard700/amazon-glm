import { ApiError } from "@/lib/api"

// ============================================================
// Limitation de débit en mémoire (fenêtre glissante simple).
// - Store sur globalThis : survit au HMR du dev server.
// - Clé = `${scope}:${ip}` — IP issue de x-forwarded-for
//   (premier élément) sinon x-real-ip sinon "local".
// - Nettoyage paresseux : aucune entrée expirée n'est conservée
//   lors du contrôle, + balayage global occasionnel (pas de timer).
// ============================================================

interface RateLimitEntry {
  windowMs: number
  hits: number[] // horodatages (Date.now()) des requêtes acceptées
}

interface RateLimitStore {
  hits: Map<string, RateLimitEntry>
}

const globalForRate = globalThis as typeof globalThis & {
  __tmRateLimitStore?: RateLimitStore
}

// ??= : conserve le store existant lors des rechargements à chaud (HMR).
globalForRate.__tmRateLimitStore ??= { hits: new Map() }
const store: RateLimitStore = globalForRate.__tmRateLimitStore

/** Seuil au-delà duquel on balaye toutes les clés (garde-fou mémoire). */
const MAX_TRACKED_KEYS = 5_000

/**
 * IP cliente : derrière le reverse-proxy de confiance (Caddy), le header
 * x-forwarded-for est APPEND (l'IP réelle du visiteur est le DERNIER
 * élément). Un attaquant ne contrôle que les éléments AVANT — prendre le
 * premier (ancien code) permettait d'usurper une IP à chaque requête et
 * de contourner tous les rate-limits.
 */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    // Dernier élément = ajouté par notre proxy (non falsifiable par le client).
    const last = forwarded.split(",").pop()?.trim()
    if (last) return last
  }
  const real = request.headers.get("x-real-ip")
  if (real) return real.trim()
  return "local"
}

/**
 * Lève ApiError(429) si `limit` requêtes ont déjà été acceptées pour
 * ce scope/IP dans les `windowMs` dernières millisecondes.
 * À appeler EN TÊTE du handler, via handle() — même pipeline d'erreur.
 */
export function enforceRateLimit(request: Request, scope: string, limit: number, windowMs: number): void {
  const key = `${scope}:${clientIp(request)}`
  checkRate(key, limit, windowMs)
}

/**
 * Rate-limit sur une clé FIXE (indépendante de l'IP) — ex : par compte
 * (anti brute-force ciblé même si l'attaquant change d'IP).
 * La clé doit être suffisamment spécifique (elle inclut l'identifiant visé).
 */
export function enforceRateLimitKey(key: string, limit: number, windowMs: number): void {
  checkRate(`fixed:${key}`, limit, windowMs)
}

/** Cœur commun : fenêtre glissante + garde-fou mémoire. */
function checkRate(key: string, limit: number, windowMs: number): void {
  const now = Date.now()

  const existing = store.hits.get(key)
  const hits = existing ? existing.hits.filter((t) => now - t < windowMs) : []

  if (hits.length >= limit) {
    if (existing) {
      existing.hits = hits // nettoyage paresseux même en cas de refus
    }
    // Signature ApiError(message, status) — cf. src/lib/api.ts.
    throw new ApiError("Trop de tentatives. Réessayez dans un instant.", 429)
  }

  hits.push(now)
  store.hits.set(key, { windowMs, hits })

  // Balayage paresseux occasionnel : supprime les clés entièrement expirées.
  if (store.hits.size > MAX_TRACKED_KEYS) {
    for (const [k, entry] of store.hits) {
      const last = entry.hits[entry.hits.length - 1]
      if (last === undefined || now - last >= entry.windowMs) {
        store.hits.delete(k)
      }
    }
  }
}
