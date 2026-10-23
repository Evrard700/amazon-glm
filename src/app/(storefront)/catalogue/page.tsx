// /catalogue — page serveur : filtres/tri/pagination via searchParams.
import type { Metadata } from "next"
import { CatalogueView } from "@/components/storefront/catalogue-view"

export const revalidate = 0

export const metadata: Metadata = {
  title: "Catalogue",
  description:
    "Parcourez tout le catalogue Téranga Market : électronique, mode, maison, beauté et produits numériques. Filtres par catégorie, collection, prix et promotions.",
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <CatalogueView searchParams={sp} basePath="/catalogue" title="Catalogue" />
    </div>
  )
}
