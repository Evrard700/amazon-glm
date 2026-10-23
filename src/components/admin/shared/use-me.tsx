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

/** Hook d'accès à l'utilisateur staff courant (rôle + permissions réelles, calculées côté serveur dans la matrice). */
export function useMe(): { me: MeInfo | null; loading: boolean } {
  const [me, setMe] = useState<MeInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch("/api/admin/users/me")
        const json = (await res.json()) as { ok: boolean; data?: { user?: { id: string; name: string; email: string; role: string; permissions?: string[] } } }
        if (active && json.ok && json.data?.user) {
          const u = json.data.user
          // Permissions EFFECTIVES renvoyées par le serveur (matrice éditable par
          // le propriétaire) ; repli sur les défauts si l'API ne les renvoie pas.
          setMe({ id: u.id, name: u.name, email: u.email, role: u.role, permissions: u.permissions ?? permissionsOf(u.role) })
        }
      } catch {
        // silencieux : l'utilisateur reste null, les actions serveur protègent de toute façon
      } finally {
        if (active) setLoading(false)
      }
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
