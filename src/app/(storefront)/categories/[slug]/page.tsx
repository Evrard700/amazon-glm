// /categories/[slug] — bannière de catégorie + catalogue pré-filtré (composant partagé).
import Link from "next/link"
import Image from "next/image"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { getCatalog, getCategories } from "@/lib/catalog-data"
import { CatalogueView } from "@/components/storefront/catalogue-view"

export const revalidate = 0

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  // findFirst({ where: { slug, isActive: true } }) — via cache (actives uniquement)
  const category = (await getCategories()).find((c) => c.slug === slug) ?? null
  if (!category) return { title: "Catégorie introuvable" }
  return {
    title: category.name,
    description:
      category.description ??
      `Découvrez les produits de la catégorie ${category.name} sur Téranga Market.`,
  }
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])

  const [category, catalog] = await Promise.all([
    getCategories().then((all) => all.find((c) => c.slug === slug) ?? null),
    getCatalog(),
  ])
  if (!category) notFound()

  // Comptage en mémoire : produits actifs non supprimés liés à la catégorie
  // (identique au count Prisma d'origine sur categories.some.categoryId)
  const total = catalog.filter((p) => p.categoryIds.includes(category.id)).length

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Bannière catégorie */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-lg">
        {category.imageUrl && (
          <>
            <Image
              src={category.imageUrl}
              alt=""
              fill
              priority
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-primary/75" aria-hidden />
          </>
        )}
        <div className="relative max-w-2xl p-6 sm:p-10">
          <nav aria-label="Fil d'Ariane" className="flex items-center gap-1.5 text-xs text-primary-foreground/75">
            <Link href="/" className="hover:underline">Accueil</Link>
            <ChevronRight className="h-3 w-3" aria-hidden />
            <Link href="/catalogue" className="hover:underline">Catalogue</Link>
            <ChevronRight className="h-3 w-3" aria-hidden />
            <span aria-current="page">{category.name}</span>
          </nav>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{category.name}</h1>
          {category.description && (
            <p className="mt-2 text-sm leading-relaxed text-primary-foreground/85 sm:text-base">
              {category.description}
            </p>
          )}
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-brand">
            {total} {total > 1 ? "produits disponibles" : "produit disponible"}
          </p>
        </div>
      </div>

      <CatalogueView
        searchParams={sp}
        basePath={`/categories/${category.slug}`}
        presetCategory={{ slug: category.slug, name: category.name }}
        title={category.name}
      />
    </div>
  )
}
