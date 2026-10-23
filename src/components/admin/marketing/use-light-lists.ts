"use client"

import { useEffect, useState } from "react"
import { useAdminApi } from "@/components/admin/api-client"
import type { LightCategory, LightClient, LightProduct } from "./entity-picker"

/**
 * Charge les listes légères (produits / catégories / clients) utilisées par
 * les sélecteurs marketing. Un seul passage par page, résultats partagés par props.
 */
export function useLightLists(options?: { products?: boolean; categories?: boolean; clients?: boolean }) {
  const api = useAdminApi()
  const needProducts = options?.products ?? true
  const needCategories = options?.categories ?? true
  const needClients = options?.clients ?? false

  const [products, setProducts] = useState<LightProduct[]>([])
  const [categories, setCategories] = useState<LightCategory[]>([])
  const [clients, setClients] = useState<LightClient[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const results = await Promise.all([
        needProducts ? api.get<LightProduct[]>("/api/admin/marketing/products") : Promise.resolve([]),
        needCategories ? api.get<LightCategory[]>("/api/admin/marketing/categories") : Promise.resolve([]),
        needClients ? api.get<LightClient[]>("/api/admin/marketing/clients") : Promise.resolve([]),
      ])
      if (cancelled || !results[0] || !results[1] || !results[2]) return
      setProducts(results[0] ?? [])
      setCategories(results[1] ?? [])
      setClients(results[2] ?? [])
      setLoaded(true)
    }
    void run()
    return () => {
      cancelled = true
    }
     
  }, [])

  return { products, categories, clients, loaded }
}
