"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { toast } from "sonner"

export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface AdminApi {
  get: <T>(url: string) => Promise<T | null>
  post: <T>(url: string, body: unknown) => Promise<T | null>
  put: <T>(url: string, body: unknown) => Promise<T | null>
  patch: <T>(url: string, body: unknown) => Promise<T | null>
  del: <T>(url: string) => Promise<T | null>
  /** DELETE avec corps JSON (actions groupées : ids de sélection). */
  delBody: <T>(url: string, body: unknown) => Promise<T | null>
}

// ============================================================================
// CACHE GET ADMIN (navigation instantanée) — stale-while-revalidate mémoire.
// Chaque lecture GET est mémoïsée : revenir sur une page visitée il y a moins
// de 15 s est IMMÉDIAT (zéro requête) ; entre 15 s et 90 s la donnée est
// servie instantanément puis actualisée en tâche de fond (le cache reste
// chaud pour la prochaine visite) ; au-delà, requête normale.
// TOUTE mutation (post/put/patch/del) purge l'intégralité du cache : une
// écriture ne peut jamais être suivie d'une lecture périmée.
// ============================================================================
const GET_FRESH_MS = 15_000
const GET_STALE_MS = 90_000

interface GetEntry {
  data: unknown
  storedAt: number
}

const globalForGetCache = globalThis as unknown as {
  __terangaAdminGetCache?: Map<string, GetEntry>
  __terangaAdminGetInflight?: Map<string, Promise<unknown>>
}

const getCache = (globalForGetCache.__terangaAdminGetCache ??= new Map())
const getInflight = (globalForGetCache.__terangaAdminGetInflight ??= new Map())

function cacheBust() {
  getCache.clear()
}

/** Fetch brut partagé — ne décide JAMAIS du cache. */
async function rawRequest<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    })
    return (await res.json()) as ApiResponse<T>
  } catch {
    return { ok: false, error: "Erreur réseau. Vérifiez votre connexion." }
  }
}

/**
 * Client API admin avec toasts d'erreur automatiques + cache GET mémoire.
 *
 * STABILITÉ FONDAMENTALE : l'objet retourné est mémoïsé sur une fonction
 * stable (`request`) → son identité ne change JAMAIS au fil des rendus.
 * C'est indispensable : les pages mettent `api` en dépendance de leurs
 * `load = useCallback(..., [api])`, eux-mêmes dépendances d'`useEffect`.
 * Un objet recréé à chaque rendu provoquerait une boucle infinie de
 * rechargements (bug observé : centaines de requêtes identiques).
 *
 * NB : l'état de chargement n'est PAS exposé ici ; les pages gèrent le leur.
 */
export function useAdminApi(): AdminApi {
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const request = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T | null> => {
    const method = (init?.method ?? "GET").toUpperCase()

    // --- MUTATION : purge totale du cache avant l'appel (jamais de lecture
    // périmée après une écriture), puis comportement historique.
    if (method !== "GET") cacheBust()

    // --- GET : parcours du cache mémoire.
    if (method === "GET") {
      const now = Date.now()
      const hit = getCache.get(url)

      // 1) Fraîche (< 15 s) → servie immédiatement, zéro requête.
      if (hit && now - hit.storedAt < GET_FRESH_MS) return hit.data as T

      // 2) Périmée mais servable (< 90 s) → servie immédiatement + une SEULE
      //    actualisation silencieuse en fond (les erreurs n'affichent rien :
      //    la valeur servie reste valable).
      if (hit && now - hit.storedAt < GET_STALE_MS) {
        if (!getInflight.has(url)) {
          const refresh = (async () => {
            try {
              const json = await rawRequest<T>(url, init)
              if (json.ok && json.data !== undefined && json.data !== null) {
                getCache.set(url, { data: json.data, storedAt: Date.now() })
              }
            } finally {
              getInflight.delete(url)
            }
          })()
          getInflight.set(url, refresh)
        }
        return hit.data as T
      }

      // 3) Première lecture (ou trop vieille) : dédoublonnage des appels
      //    simultanés identiques (anti-stampede), puis mise en cache.
      const ongoing = getInflight.get(url) as Promise<T | null> | undefined
      if (ongoing) return ongoing

      const promise = (async (): Promise<T | null> => {
        try {
          const json = await rawRequest<T>(url, init)
          if (!json.ok) {
            toast.error(json.error ?? "Une erreur est survenue.")
            return null
          }
          if (json.data !== undefined && json.data !== null) {
            getCache.set(url, { data: json.data, storedAt: Date.now() })
          }
          return (json.data ?? null) as T | null
        } finally {
          getInflight.delete(url)
        }
      })()
      getInflight.set(url, promise)
      return promise
    }

    // --- Mutation : requête directe (cache déjà purgé ci-dessus).
    const json = await rawRequest<T>(url, init)
    if (!json.ok) {
      toast.error(json.error ?? "Une erreur est survenue.")
      return null
    }
    return (json.data ?? null) as T | null
  }, [])

  return useMemo(
    () => ({
      get: <T,>(url: string) => request<T>(url),
      post: <T,>(url: string, body: unknown) => request<T>(url, { method: "POST", body: JSON.stringify(body) }),
      put: <T,>(url: string, body: unknown) => request<T>(url, { method: "PUT", body: JSON.stringify(body) }),
      patch: <T,>(url: string, body: unknown) => request<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
      del: <T,>(url: string) => request<T>(url, { method: "DELETE" }),
      delBody: <T,>(url: string, body: unknown) => request<T>(url, { method: "DELETE", body: JSON.stringify(body) }),
    }),
    [request],
  )
}
