"use client"

import { useSyncExternalStore, type ReactNode } from "react"

const emptySubscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

export function useIsClient(): boolean {
  return useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot)
}

/**
 * Barrière client-only pour les îlots Radix (useId) du storefront.
 *
 * POURQUOI : les identifiants générés par React useId (Sheet, DropdownMenu,
 * Select, Tabs, Accordion de Radix) peuvent diverger entre le HTML servi et
 * l'hydratation dès qu'un segment Suspense (loading.tsx) est streamé —
 * avertissement « hydrated but attributes didn't match » (aria-controls,
 * aria-labelledby radix-_R_…). Cette barrière rend un `fallback` statique
 * (identique serveur/client → zéro divergence possible), puis monte l'îlot
 * interactif juste après l'hydratation (pattern useSyncExternalStore, sans
 * setState dans un effet : React gère la transition proprement).
 *
 * Le fallback doit avoir la même forme/taille que l'îlot monté (zéro CLS) —
 * c'est le cas pour les petits contrôles du header/filtres (montage en < 1 frame).
 */
export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const mounted = useIsClient()
  return <>{mounted ? children : fallback}</>
}
