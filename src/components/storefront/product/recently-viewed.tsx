"use client"

// « Vus récemment » — localStorage tm_recently_viewed (push au montage, max 6 affichés).
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Package } from "lucide-react"
import { PriceTag } from "@/components/storefront/price"

const STORAGE_KEY = "tm_recently_viewed"
const MAX_SHOWN = 6

interface RecentEntry {
  id: string
  name: string
  slug: string
  price: number
  salePrice: number | null
  images: string[]
  type: string
  viewedAt?: string
}

function isEntry(v: unknown): v is RecentEntry {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { id?: unknown }).id === "string" &&
    typeof (v as { name?: unknown }).name === "string" &&
    typeof (v as { slug?: unknown }).slug === "string"
  )
}

export function RecentlyViewed({ current }: { current: RecentEntry }) {
  const [items, setItems] = useState<RecentEntry[] | null>(null)
  const savedRef = useRef(false)

  useEffect(() => {
    if (savedRef.current) return // évite les doubles écritures (StrictMode)
    savedRef.current = true
    let list: RecentEntry[] = []
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) list = parsed.filter(isEntry)
    } catch {
      list = []
    }
    // pousse le produit courant en tête (sans doublon), garde 20 en mémoire
    const next = [{ ...current, viewedAt: new Date().toISOString() }, ...list.filter((i) => i.id !== current.id)].slice(0, 20)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* quota — ignoré */
    }
    // Mise à jour de l'UI après la synchronisation du stockage externe (callback asynchrone).
    const raf = setTimeout(() => {
      setItems(list.filter((i) => i.id !== current.id).slice(0, MAX_SHOWN))
    }, 0)
    return () => clearTimeout(raf)
  }, [current.id])

  if (!items || items.length === 0) return null

  return (
    <section aria-labelledby="recently-viewed-title" className="mt-12">
      <h2 id="recently-viewed-title" className="mb-3 text-lg font-extrabold tracking-tight">
        Vus récemment
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/products/${item.slug}`}
            className="flex w-40 shrink-0 flex-col gap-2 rounded-xl border bg-card p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="relative aspect-square overflow-hidden rounded-lg bg-secondary/40">
              {item.images?.[0] ? (
                <Image src={item.images[0]} alt={item.name} fill sizes="160px" className="object-cover" />
              ) : (
                <span className="grid h-full place-items-center text-muted-foreground">
                  <Package className="h-7 w-7" strokeWidth={1.5} aria-hidden />
                </span>
              )}
            </div>
            <p className="line-clamp-2 text-xs font-medium leading-snug">{item.name}</p>
            <PriceTag price={item.price} salePrice={item.salePrice} size="sm" />
          </Link>
        ))}
      </div>
    </section>
  )
}
