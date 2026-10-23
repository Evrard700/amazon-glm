import { notFound, redirect } from "next/navigation"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { parsePublishedSections, renderSection } from "@/components/storefront/sections/render"

export const dynamic = "force-dynamic"

/**
 * APERÇU DU BROUILLON — réservé au staff connecté (session vérifiée côté serveur).
 * Rend le brouillon de la page exactement comme la boutique le publiera.
 */
export default async function PreviewDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user || !["OWNER", "ADMIN", "MANAGER", "MARKETING", "STAFF"].includes(user.role)) {
    redirect("/admin/login")
  }

  const { id } = await params
  const page = await db.page.findUnique({ where: { id } })
  if (!page) notFound()

  const sections = parsePublishedSections(page.draftData)
  const visible = sections.filter((s) => !s.hidden)
  const rendered = await Promise.all(visible.map((section) => renderSection(section)))

  return (
    <div>
      {/* Marqueur d'aperçu */}
      <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-xs font-bold text-amber-950">
        👁 Aperçu du BROUILLON — « {page.title} » — ces contenus ne sont visibles qu'à l'équipe
      </div>
      <div className="mx-auto max-w-7xl px-4">
        {rendered.map((node, i) => (
          <section key={visible[i]?.id ?? i}>{node}</section>
        ))}
      </div>
    </div>
  )
}
