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

/**
 * Client API admin avec toasts d'erreur automatiques.
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
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      })
      const json = (await res.json()) as ApiResponse<T>
      if (!json.ok) {
        toast.error(json.error ?? "Une erreur est survenue.")
        return null
      }
      return json.data as T
    } catch {
      toast.error("Erreur réseau. Vérifiez votre connexion.")
      return null
    }
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
