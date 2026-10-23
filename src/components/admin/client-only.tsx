"use client"

import { useSyncExternalStore } from "react"
import { Skeleton } from "@/components/ui/skeleton"

const emptySubscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

/**
 * Détection « côté navigateur » sans setState dans un effet (pattern canonique
 * useSyncExternalStore) : false pendant le SSR ET pendant la passe
 * d'hydratation, true juste après — React gère la transition sans jamais
 * signaler de divergence.
 */
function useIsClient(): boolean {
  return useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot)
}

/**
 * Barrière client-only pour le contenu des pages admin.
 *
 * POURQUOI : les pages admin sont des composants client rendus aussi côté
 * serveur (SSR). Sous Next 16 / React 19.2, les identifiants générés par
 * useId (Radix Tabs/Select/Dialog, dnd-kit…) divergent entre le HTML serveur
 * et l'hydratation dès qu'un segment Suspense (loading.tsx) retarde le rendu
 * → erreurs « hydrated but attributes didn't match » dans la console.
 *
 * Le rendu initial des pages admin est de toute façon un squelette (les
 * données arrivent côté client via fetch) : rendre ce squelette côté serveur
 * n'apporte RIEN. Cette barrière rend donc le squelette serveur == client,
 * puis monte l'UI réelle après hydratation → PLUS AUCUNE divergence possible
 * (attributs, dates, locale, id Radix…).
 */
export function ClientOnly({ children, className }: { children: React.ReactNode; className?: string }) {
  const mounted = useIsClient()

  if (!mounted) {
    return (
      <div className={className ?? "space-y-4 p-4 sm:p-6"} aria-busy="true" aria-label="Chargement de la page">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="grid grid-cols-2 gap-3 pt-2 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  return <>{children}</>
}
