"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Loader2, PackageSearch, Search } from "lucide-react"
import { formatXOF } from "@/lib/money"

// Barre de recherche du header avec suggestions en direct (type marketplace) :
// debounce 300 ms + AbortController, navigation clavier complète, ARIA combobox.
// Composant volontairement léger (utilisé dans le layout de TOUTES les pages).

interface SuggestedProduct {
  name: string
  slug: string
  price: number
  salePrice: number | null
  image: string | null
  rating: number
  type: string
}

interface SuggestedCategory {
  name: string
  slug: string
}

interface SuggestionsData {
  products: SuggestedProduct[]
  categories: SuggestedCategory[]
}

interface Option {
  id: string
  href: string
  kind: "product" | "category" | "all"
}

const LISTBOX_ID = "tm-search-listbox"

export function SearchBar({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)
  const [suggestions, setSuggestions] = useState<SuggestionsData | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)

  const trimmed = q.trim()
  const products = suggestions?.products ?? []
  const categories = suggestions?.categories ?? []
  const hasResults = products.length + categories.length > 0

  // Options plates pour la navigation clavier (produits → catégories → voir tout).
  const options: Option[] = trimmed.length < 2 ? [] : [
    ...products.map((p) => ({
      id: `tm-sug-product-${p.slug}`,
      href: `/products/${p.slug}`,
      kind: "product" as const,
    })),
    ...categories.map((c) => ({
      id: `tm-sug-category-${c.slug}`,
      href: `/categories/${c.slug}`,
      kind: "category" as const,
    })),
    { id: "tm-sug-all", href: `/catalogue?q=${encodeURIComponent(trimmed)}`, kind: "all" as const },
  ]

  const closeSuggestions = useCallback(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = undefined
    abortRef.current?.abort()
    abortRef.current = null
    setOpen(false)
    setActiveIndex(-1)
    setLoading(false)
  }, [])

  const fetchSuggestions = useCallback((query: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then(async (res) => {
        const payload = (await res.json()) as { ok: boolean; data?: SuggestionsData }
        if (!controller.signal.aborted && payload.ok && payload.data) {
          setSuggestions(payload.data)
          setActiveIndex(-1)
          setOpen(true)
        }
      })
      .catch(() => {
        // Requête annulée ou indisponible : suggestions simplement ignorées.
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
  }, [])

  /** Débounce 300 ms ; moins de 2 caractères → fermeture immédiate. */
  const scheduleFetch = useCallback(
    (value: string) => {
      clearTimeout(debounceRef.current)
      const clean = value.trim()
      if (clean.length < 2) {
        abortRef.current?.abort()
        abortRef.current = null
        setSuggestions(null)
        setActiveIndex(-1)
        setOpen(false)
        setLoading(false)
        return
      }
      setOpen(true) // affiche l'état « Recherche… » pendant le délai
      debounceRef.current = setTimeout(() => fetchSuggestions(clean), 300)
    },
    [fetchSuggestions],
  )

  // Fermeture au clic/toucher extérieur.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  // Nettoyage au démontage (changement de page).
  useEffect(
    () => () => {
      clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    },
    [],
  )

  // L'option active reste visible quand on navigue au clavier.
  useEffect(() => {
    if (activeIndex >= 0 && options[activeIndex]) {
      document.getElementById(options[activeIndex].id)?.scrollIntoView({ block: "nearest" })
    }
  }, [activeIndex, options])

  const activeOption = activeIndex >= 0 ? options[activeIndex] : null

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        className="relative w-full"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          closeSuggestions()
          const query = q.trim()
          router.push(query ? `/catalogue?q=${encodeURIComponent(query)}` : "/catalogue")
        }}
      >
        <Search className="absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActiveIndex(-1)
            scheduleFetch(e.target.value)
          }}
          onFocus={() => {
            if (trimmed.length >= 2) {
              if (suggestions) setOpen(true)
              else scheduleFetch(q)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              if (options.length === 0) return
              e.preventDefault()
              setOpen(true)
              setActiveIndex((i) => (i + 1) % options.length)
            } else if (e.key === "ArrowUp") {
              if (options.length === 0) return
              e.preventDefault()
              setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1))
            } else if (e.key === "Enter") {
              // Entrée SANS suggestion active = submit normal vers /catalogue.
              if (open && activeOption) {
                e.preventDefault()
                closeSuggestions()
                router.push(activeOption.href)
              }
            } else if (e.key === "Escape") {
              if (open) e.preventDefault()
              closeSuggestions()
            } else if (e.key === "Tab") {
              setOpen(false)
              setActiveIndex(-1)
            }
          }}
          placeholder="Rechercher un produit, une marque…"
          aria-label="Rechercher un produit"
          role="combobox"
          aria-expanded={open}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={activeOption?.id}
          autoComplete="off"
          className="h-10 w-full rounded-lg border bg-card pl-10 pr-4 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring"
        />

        {open && (
          <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xl">
            {loading ? (
              <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Recherche…
              </p>
            ) : (
              <ul
                id={LISTBOX_ID}
                role="listbox"
                aria-label="Suggestions de recherche"
                className="max-h-[min(26rem,60dvh)] overflow-y-auto py-1"
              >
                {trimmed.length < 2 ? null : !hasResults ? (
                  <li className="px-4 py-3 text-sm text-muted-foreground">
                    Aucun produit trouvé pour «&nbsp;{trimmed}&nbsp;».
                  </li>
                ) : (
                  <>
                    {products.length > 0 && (
                      <li role="presentation" className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Produits
                      </li>
                    )}
                    {products.map((p, i) => {
                      const option = options[i]
                      const selected = activeOption?.id === option.id
                      return (
                        <li key={option.id} role="option" aria-selected={selected} id={option.id}>
                          <Link
                            href={option.href}
                            onClick={() => closeSuggestions()}
                            onMouseEnter={() => setActiveIndex(i)}
                            className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                              selected ? "bg-secondary" : "hover:bg-secondary/60"
                            }`}
                          >
                            {p.image ? (
                              <Image
                                src={p.image}
                                alt={p.name}
                                width={40}
                                height={40}
                                className="h-10 w-10 shrink-0 rounded-md border object-cover"
                              />
                            ) : (
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-secondary">
                                <PackageSearch className="h-4 w-4 text-muted-foreground" aria-hidden />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{p.name}</span>
                              {p.rating > 0 && (
                                <span className="text-xs text-amber-500" aria-label={`Note ${p.rating.toFixed(1)} sur 5`}>
                                  ★ {p.rating.toFixed(1)}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-right">
                              {p.salePrice !== null && p.salePrice < p.price ? (
                                <>
                                  <span className="block whitespace-nowrap text-sm font-semibold">
                                    {formatXOF(p.salePrice)}
                                  </span>
                                  <s className="block text-xs text-muted-foreground">{formatXOF(p.price)}</s>
                                </>
                              ) : (
                                <span className="whitespace-nowrap text-sm font-semibold">{formatXOF(p.price)}</span>
                              )}
                            </span>
                          </Link>
                        </li>
                      )
                    })}

                    {categories.length > 0 && (
                      <li role="presentation" className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Catégories
                      </li>
                    )}
                    {categories.map((c, i) => {
                      const option = options[products.length + i]
                      const selected = activeOption?.id === option.id
                      return (
                        <li key={option.id} role="option" aria-selected={selected} id={option.id}>
                          <Link
                            href={option.href}
                            onClick={() => closeSuggestions()}
                            onMouseEnter={() => setActiveIndex(products.length + i)}
                            className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                              selected ? "bg-secondary" : "hover:bg-secondary/60"
                            }`}
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-secondary">
                              <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{c.name}</span>
                              <span className="text-xs text-muted-foreground">Parcourir la catégorie</span>
                            </span>
                          </Link>
                        </li>
                      )
                    })}

                    <li
                      role="option"
                      aria-selected={activeOption?.id === "tm-sug-all"}
                      id="tm-sug-all"
                      className="border-t bg-secondary/40"
                    >
                      <Link
                        href={`/catalogue?q=${encodeURIComponent(trimmed)}`}
                        onClick={() => closeSuggestions()}
                        onMouseEnter={() => setActiveIndex(options.length - 1)}
                        className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                          activeOption?.id === "tm-sug-all" ? "bg-secondary" : "hover:bg-secondary/60"
                        }`}
                      >
                        <Search className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">
                          Voir tous les résultats pour «&nbsp;{trimmed}&nbsp;»
                        </span>
                      </Link>
                    </li>
                  </>
                )}
              </ul>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
