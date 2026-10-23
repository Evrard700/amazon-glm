// ============================================================================
// CACHE MÉMOIRE TTL — zéro dépendance, protection anti-stampede,
// STALE-WHILE-REVALIDATE pour les lectures lourdes.
// Survit au HMR de dev via globalThis (même approche que src/lib/db.ts).
//
// - `cached(key, ttlMs, loader, staleMs?)` :
//   • fraîche (< ttlMs)      → servie immédiatement ;
//   • périmée mais « servable » (âge < ttlMs + staleMs) → servie AUSSITÔT
//     pendant qu'une actualisation démarre en tâche de fond (SWR) — la
//     valeur devient fraîche sans que QUICONQUE ne paie l'attente ;
//   • trop vieille (ou première fois) → le loader s'exécute, les appels
//     concurrents partagent la même promesse (anti-stampede).
//   Les écritures invalident explicitement via invalidateCache() : la fenêtre
//   SWR ne fait que lisser la révalidation, jamais masquer une mutation.
//
// - `invalidateCache(prefix?)` : purge les clés commençant par `prefix`
//   (purge totale si aucun argument).
//
// ROBUSTESSE : les loaders sont des LECTURES idempotentes — UNE relance
// (350 ms) masque les micro-coupures réseau vers la base distante
// (« Can't reach database server » transitoires) au lieu de faire échouer
// une page entière. Les erreurs métier remontent telles quelles au 2e essai.
// ============================================================================

interface CacheEntry {
  value: unknown
  expiresAt: number
}

interface CacheStore {
  entries: Map<string, CacheEntry>
  inflight: Map<string, Promise<unknown>>
}

const globalForCache = globalThis as unknown as {
  __terangaCache?: CacheStore
}

const store: CacheStore = (globalForCache.__terangaCache ??= {
  entries: new Map(),
  inflight: new Map(),
})

/** Exécute le loader avec UNE relance (350 ms) — voir plus haut. */
async function retryingLoader<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader()
  } catch {
    await new Promise((r) => setTimeout(r, 350))
    return await loader()
  }
}

/**
 * Lecture à travers le cache mémoire. Thread-safe par nature (boucle
 * d'événements mono-thread) ; les requêtes simultanées sur la même clé
 * partagent la même promesse (anti-stampede).
 *
 * @param staleMs fenêtre « serve stale while revalidate » après le TTL
 *               (0 = comportement classique : attente du rechargement).
 */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>, staleMs = 0): Promise<T> {
  const now = Date.now()
  const hit = store.entries.get(key)

  if (hit) {
    // 1) Encore fraîche → réponse immédiate.
    if (hit.expiresAt > now) return hit.value as T

    // 2) Périmée mais servable (SWR) → réponse immédiate + refresh en fond.
    if (staleMs > 0 && hit.expiresAt + staleMs > now) {
      if (!store.inflight.has(key)) {
        const refresh = (async () => {
          try {
            const value = await retryingLoader(loader)
            store.entries.set(key, { value, expiresAt: Date.now() + ttlMs })
          } catch {
            /* la valeur périmée continuera d'être servie jusqu'à l'invalidation */
          } finally {
            store.inflight.delete(key)
          }
        })()
        store.inflight.set(key, refresh)
      }
      return hit.value as T
    }
  }

  // 3) Première lecture (ou trop vieille) : une requête est-elle déjà en vol ?
  const ongoing = store.inflight.get(key) as Promise<T> | undefined
  if (ongoing) return ongoing

  const promise = (async (): Promise<T> => {
    try {
      const value = await retryingLoader(loader)
      // Garde-fou mémoire : au-delà de 500 entrées, purge paresseuse des
      // entrées expirées (les clés de session/visiteur sont nombreuses).
      if (store.entries.size > 500) {
        const nowMs = Date.now()
        for (const [k, v] of [...store.entries.entries()]) {
          if (v.expiresAt <= nowMs) store.entries.delete(k)
        }
      }
      store.entries.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    } finally {
      // Jamais d'entrée en vol orpheline, même si le loader échoue.
      store.inflight.delete(key)
    }
  })()

  store.inflight.set(key, promise)
  return promise
}

/**
 * Invalide le cache : purger toutes les clés commençant par `prefix`
 * (correspondance stricte sur le préfixe) ou la totalité sans argument.
 */
export function invalidateCache(prefix?: string): void {
  if (prefix === undefined || prefix === "") {
    store.entries.clear()
    return
  }
  for (const key of [...store.entries.keys()]) {
    if (key.startsWith(prefix)) store.entries.delete(key)
  }
}
