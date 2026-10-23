// Pagination serveur — liens prev/next + fenêtre de numéros, params préservés.
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { buildCatalogueUrl, type CatalogueParams } from "./catalogue-params"

export function CataloguePagination({
  basePath,
  params,
  page,
  totalPages,
}: {
  basePath: string
  params: CatalogueParams
  page: number
  totalPages: number
}) {
  if (totalPages <= 1) return null

  const href = (p: number) => buildCatalogueUrl(basePath, params, { page: p === 1 ? null : String(p) })

  // Fenêtre de 5 pages centrée sur la page courante.
  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
  const end = Math.min(totalPages, start + 4)
  const numbers: number[] = []
  for (let i = start; i <= end; i++) numbers.push(i)

  const linkClass =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border bg-card px-2 text-sm font-semibold shadow-sm transition hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"

  return (
    <nav aria-label="Pagination" className="mt-8">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {page > 1 ? (
          <Link href={href(page - 1)} className={cn(linkClass, "px-3")} rel="prev" aria-label="Page précédente">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Précédent</span>
          </Link>
        ) : (
          <span className={cn(linkClass, "px-3 opacity-40")} aria-disabled>
            <ChevronLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Précédent</span>
          </span>
        )}

        {start > 1 && (
          <>
            <Link href={href(1)} className={linkClass} aria-label="Page 1">1</Link>
            {start > 2 && <span className="px-1 text-muted-foreground">…</span>}
          </>
        )}

        {numbers.map((n) =>
          n === page ? (
            <span key={n} aria-current="page" className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-brand px-2 text-sm font-bold text-brand-foreground shadow-sm">
              {n}
            </span>
          ) : (
            <Link key={n} href={href(n)} className={linkClass}>
              {n}
            </Link>
          ),
        )}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="px-1 text-muted-foreground">…</span>}
            <Link href={href(totalPages)} className={linkClass} aria-label={`Page ${totalPages}`}>
              {totalPages}
            </Link>
          </>
        )}

        {page < totalPages ? (
          <Link href={href(page + 1)} className={cn(linkClass, "px-3")} rel="next" aria-label="Page suivante">
            <span className="hidden sm:inline">Suivant</span>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <span className={cn(linkClass, "px-3 opacity-40")} aria-disabled>
            <span className="hidden sm:inline">Suivant</span>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Page {page} sur {totalPages}
      </p>
    </nav>
  )
}
