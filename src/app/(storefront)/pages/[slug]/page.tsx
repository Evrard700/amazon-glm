// PAGES ÉDITORIALES — /pages/[slug] : rendu via le moteur de sections (publishedData).
import { Fragment } from "react"
import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { db } from "@/lib/db"
import { parsePublishedSections, renderSection } from "@/components/storefront/sections/render"

export const revalidate = 0

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const page = await db.page.findUnique({ where: { slug }, select: { title: true, isPublished: true } })
  return {
    title: page?.isPublished ? page.title : "Page introuvable",
    description: page?.isPublished
      ? `${page.title} — toutes les informations sur Téranga Market.`
      : undefined,
  }
}

export default async function EditorialPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (slug === "home") notFound() // la home vit à la racine

  const page = await db.page.findUnique({ where: { slug } })
  if (!page || !page.isPublished || !page.publishedData) notFound()

  const sections = parsePublishedSections(page.publishedData).filter((s) => !s.hidden)
  const nodes = await Promise.all(sections.map((s) => renderSection(s)))

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:pt-8">
      <nav aria-label="Fil d'Ariane" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground hover:underline">Accueil</Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span aria-current="page" className="font-medium text-foreground">{page.title}</span>
      </nav>

      <header className="py-8">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{page.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Mis à jour le{" "}
          {new Date(page.publishedAt ?? page.updatedAt).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </header>

      {nodes.length === 0 ? (
        <p className="mb-16 rounded-xl border border-dashed bg-stone-50 p-10 text-center text-sm text-muted-foreground">
          Cette page est publiée mais ne contient aucune section visible.
        </p>
      ) : (
        <div className="pb-8">
          {nodes.map((node, i) => (
            <Fragment key={sections[i].id}>{node}</Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
