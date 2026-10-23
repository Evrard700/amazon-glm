// PAGE D'ACCUEIL — pilotée par l'éditeur visuel (table Page, slug "home").
// Rend chaque section publiée non-masquée via le moteur de sections.
import { Fragment } from "react"
import Link from "next/link"
import type { Metadata } from "next"
import { PackageSearch } from "lucide-react"
import { db } from "@/lib/db"
import { cached } from "@/lib/cache"
import { getSettings } from "@/lib/catalog-data"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/storefront/empty-state"
import { parsePublishedSections, renderSection } from "@/components/storefront/sections/render"
import { getCatalog, getCollections, getLatestReviews } from "@/lib/catalog-data"

export const revalidate = 0

/** Page « home » publiée — mise en cache 30 s (invalidée par publication admin). */
function getHomePage() {
  return cached(
    "page:home",
    30_000,
    () => db.page.findUnique({ where: { slug: "home" } }),
    600_000,
  )
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings()
  return {
    title: { absolute: settings.metaTitle ?? "Téranga Market — Le meilleur du shopping en ligne" },
    description:
      settings.metaDescription ??
      "Marketplace africaine : électronique, mode, maison, produits numériques. Paiement à la livraison, parrainage payant.",
    openGraph: {
      title: settings.metaTitle ?? "Téranga Market",
      description: settings.metaDescription ?? undefined,
      type: "website",
    },
  }
}

export default async function HomePage() {
  // Préchauffage immédiat des caches catalogue/collections/avis AVANT de
  // connaître les sections : ces lectures démarrent EN PARALLÈLE de la page
  // « home », et les sections partagent les mêmes promesses en vol
  // (anti-stampede) — une seule salve DB au lieu de deux vagues.
  // Les erreurs sont absorbées ici (rien d'affiché ne dépend directement de
  // ces promesses : les sections retentent leur propre lecture).
  void getCatalog().catch(() => {})
  void getCollections().catch(() => {})
  void getLatestReviews().catch(() => {})

  const page = await getHomePage()
  const sections = parsePublishedSections(page?.publishedData).filter((s) => !s.hidden)

  if (sections.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState
          icon={PackageSearch}
          title="La page d'accueil n'a pas encore été publiée"
          description="Aucune section n'est active pour le moment. En attendant, parcourez l'ensemble du catalogue."
          action={
            <Button asChild className="bg-brand text-brand-foreground hover:brightness-95">
              <Link href="/catalogue">Parcourir le catalogue</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const nodes = await Promise.all(sections.map((s) => renderSection(s)))

  return (
    <>
      {nodes.map((node, i) => (
        <Fragment key={sections[i].id}>{node}</Fragment>
      ))}
    </>
  )
}
