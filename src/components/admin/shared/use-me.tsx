"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { permissionsOf } from "@/lib/rbac-defaults"

export interface MeInfo {
  id: string
  name: string
  email: string
  role: string
  permissions: string[]
}

// ============================================================================
// CACHE MÉMOIRE DU PROFIL STAFF (SWR) — le profil ne change qu'à la connexion
// ou quand le propriétaire édite les rôles. Fraîche 60 s → servie sans aucune
// requête ; entre 60 s et 5 min → servie immédiatement + actualisation en
// tâche de fond (prochaine visite = instantanée). Survit aux re-mounts de
// navigation (globalThis), jamais aux rechargements complets de l'onglet.
// ============================================================================
const ME_FRESH_MS = 60_000
const ME_STALE_MS = 300_000

const globalForMe = globalThis as unknown as {
  __terangaMeCache?: { data: MeInfo; storedAt: number } | null
  __terangaMeInflight?: Promise<void> | null
}
let meCache: { data: MeInfo; storedAt: number } | null = (globalForMe.__terangaMeCache ??= null)
let meInflight: Promise<void> | null = (globalForMe.__terangaMeInflight ??= null)

async function fetchMe(active: (me: MeInfo) => void): Promise<void> {
  try {
    const res = await fetch("/api/admin/users/me")
    const json = (await res.json()) as { ok: boolean; data?: { user?: { id: string; name: string; email: string; role: string; permissions?: string[] } } }
    if (json.ok && json.data?.user) {
      const u = json.data.user
      const me: MeInfo = { id: u.id, name: u.name, email: u.email, role: u.role, permissions: u.permissions ?? permissionsOf(u.role) }
      meCache = { data: me, storedAt: Date.now() }
      globalForMe.__terangaMeCache = meCache
      active(me)
    }
  } catch {
    /* silencieux : l'utilisateur reste null, les actions serveur protègent de toute façon */
  }
}

/** Hook d'accès à l'utilisateur staff courant (rôle + permissions réelles, calculées côté serveur dans la matrice). */
export function useMe(): { me: MeInfo | null; loading: boolean } {
  const [me, setMe] = useState<MeInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const accept = (value: MeInfo) => {
      if (active) setMe(value)
    }
    const finish = () => {
      if (active) setLoading(false)
    }

    ;(async () => {
      const now = Date.now()

      // 1) Fraîche (< 60 s) → réponse IMMÉDIATE, zéro requête.
      if (meCache && now - meCache.storedAt < ME_FRESH_MS) {
        accept(meCache.data)
        finish()
        return
      }

      // 2) Périmée mais servable (< 5 min) → affichage immédiat + UNE
      //    actualisation silencieuse en fond (prochaine visite instantanée).
      if (meCache && now - meCache.storedAt < ME_STALE_MS) {
        accept(meCache.data)
        finish()
        if (!meInflight) {
          meInflight = fetchMe(accept).finally(() => {
            meInflight = null
            globalForMe.__terangaMeInflight = null
          })
          globalForMe.__terangaMeInflight = meInflight
        }
        return
      }

      // 3) Aucun cache utilisable → chargement dédupliqué : les montages
      //    simultanés partagent la MÊME requête, chacun reçoit le résultat.
      if (!meInflight) {
        meInflight = fetchMe(accept).finally(() => {
          meInflight = null
          globalForMe.__terangaMeInflight = null
        })
        globalForMe.__terangaMeInflight = meInflight
      }
      await meInflight
      if (meCache) accept(meCache.data)
      finish()
    })()

    return () => {
      active = false
    }
  }, [])

  return { me, loading: me === null && loading }
}

/** Contexte optionnel pour partager `me` entre composants d'une page. */
const MeContext = createContext<MeInfo | null>(null)

export function MeProvider({ me, children }: { me: MeInfo | null; children: React.ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>
}

export function useMeContext(): MeInfo | null {
  return useContext(MeContext)
}
