// Skeleton de la vitrine pendant le rendu des pages (catalogue, catégories…) :
// le shell (header/footer) est streamé immédiatement, la grille apparaît en fade.
export default function StorefrontLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-6 h-8 w-56 animate-pulse rounded-lg bg-secondary" />
      <div className="mb-8 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-28 animate-pulse rounded-full bg-secondary/80" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border bg-card">
            <div className="aspect-square animate-pulse bg-secondary" />
            <div className="space-y-2 p-3">
              <div className="h-3.5 w-4/5 animate-pulse rounded bg-secondary" />
              <div className="h-3 w-3/5 animate-pulse rounded bg-secondary/60" />
              <div className="h-5 w-1/3 animate-pulse rounded bg-secondary/80" />
              <div className="h-9 w-full animate-pulse rounded-lg bg-brand-soft" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
