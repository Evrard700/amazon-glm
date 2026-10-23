"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

// ============================================================
// Chargeur différé de l'éditeur visuel (dnd-kit + registre de
// sections + canevas, plus de 1 500 lignes). Une seule route
// l'utilise : chargé à la demande (ssr désactivé, squelette
// pendant l'arrivée) pour alléger le bundle de la console admin.
// ============================================================

const PageEditor = dynamic(() => import("./page-editor").then((m) => m.PageEditor), {
  ssr: false,
  loading: () => (
    <div className="p-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-4 h-96 w-full" />
    </div>
  ),
})

type PageEditorProps = React.ComponentProps<typeof PageEditor>

export function PageEditorLoader(props: PageEditorProps) {
  return <PageEditor {...props} />
}
