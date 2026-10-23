// Section publique GRILLE DE CATÉGORIES — data-driven (db).
// Catégories via le cache mémoire (src/lib/catalog-data).
import Link from "next/link"
import Image from "next/image"
import { getCategories } from "@/lib/catalog-data"
import { Container, num, str } from "./section-ui"
import { SectionHeading, SeeAllLink } from "./section-ui"
import { Reveal } from "./Reveal"

export async function CategoriesSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title, "Explorez par catégorie")
  const count = num(props.count, 6, 1, 12)
  // Mêmes contraintes que la requête d'origine : actives, racines, position croissante.
  const categories = (await getCategories()).filter((c) => c.parentId === null).slice(0, count)
  if (categories.length === 0) return null

  return (
    <Container className="py-10">
      <SectionHeading title={title} action={<SeeAllLink href="/catalogue" label="Tout le catalogue" />} />
      <Reveal>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/categories/${cat.slug}`}
              className="group overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-secondary/40">
                {cat.imageUrl ? (
                  <Image
                    src={cat.imageUrl}
                    alt={cat.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-2xl font-black text-muted-foreground/30">
                    {cat.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <p className="truncate p-3 text-center text-sm font-semibold transition group-hover:text-brand-foreground">
                {cat.name}
              </p>
            </Link>
          ))}
        </div>
      </Reveal>
    </Container>
  )
}
