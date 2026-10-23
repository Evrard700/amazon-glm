import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { parsePublishedSections } from "@/components/storefront/sections/render"
import { PageEditorLoader } from "@/components/admin/editor/page-editor-loader"

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const page = await db.page.findUnique({ where: { id } })
  if (!page || !page.draftData) notFound()

  const sections = parsePublishedSections(page.draftData)

  return (
    <PageEditorLoader
      page={{
        id: page.id,
        title: page.title,
        slug: page.slug,
        isSystem: page.isSystem,
        isPublished: page.isPublished,
        sections,
      }}
    />
  )
}
