// Skeleton affiché pendant la compilation/le rendu de CHAQUE route admin :
// les navigations paraissent instantanées (le shell est streamé immédiatement)
// pendant que la page cliente récupère ses données (API cachée 15 s côté serveur).
export default function AdminLoading() {
  return (
    <div className="animate-in fade-in duration-150">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-64 max-w-full animate-pulse rounded-lg bg-secondary" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-secondary/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
            <div className="mt-2.5 h-7 w-20 animate-pulse rounded bg-secondary/80" />
          </div>
        ))}
      </div>
      <div className="mt-6 space-y-3 rounded-xl border bg-card p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-secondary" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-2/5 animate-pulse rounded bg-secondary" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-secondary/60" />
            </div>
            <div className="h-6 w-16 animate-pulse rounded bg-secondary/70" />
          </div>
        ))}
      </div>
    </div>
  )
}
