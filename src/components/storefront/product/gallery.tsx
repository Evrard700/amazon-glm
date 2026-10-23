"use client"

// Galerie produit — image principale animée + miniatures, zoom léger au survol (desktop).
import { useState } from "react"
import Image from "next/image"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Package, ZoomIn } from "lucide-react"
import { cn } from "@/lib/utils"

export function ProductGallery({
  images,
  name,
  badge,
}: {
  images: string[]
  name: string
  badge?: React.ReactNode
}) {
  const [index, setIndex] = useState(0)
  const reduce = useReducedMotion()
  const safeIndex = Math.min(index, Math.max(0, images.length - 1))
  const current = images[safeIndex]

  return (
    <div className="flex flex-col gap-3">
      <div className="group relative aspect-square overflow-hidden rounded-xl border bg-secondary/40 shadow-sm">
        {current ? (
          <>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={safeIndex}
                initial={reduce ? undefined : { opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="absolute inset-0 cursor-zoom-in"
              >
                <Image
                  src={current}
                  alt={name}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </motion.div>
            </AnimatePresence>
            <span className="pointer-events-none absolute bottom-3 right-3 hidden items-center gap-1.5 rounded-lg bg-card/90 px-2.5 py-1.5 text-xs font-medium text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 sm:inline-flex">
              <ZoomIn className="h-3.5 w-3.5" aria-hidden /> Survoler pour zoomer
            </span>
          </>
        ) : (
          <div className="grid h-full place-items-center bg-secondary/60 text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Package className="h-16 w-16" strokeWidth={1.2} aria-hidden />
              <p className="text-sm text-muted-foreground">Aucune image disponible</p>
            </div>
          </div>
        )}
        {badge && <div className="absolute left-3 top-3 z-10 flex flex-col gap-1">{badge}</div>}
      </div>

      {images.length > 1 && (
        <div
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
          role="tablist"
          aria-label="Miniatures du produit"
        >
          {images.map((img, i) => (
            <button
              key={img + i}
              type="button"
              role="tab"
              aria-selected={i === safeIndex}
              aria-label={`Image ${i + 1} sur ${images.length}`}
              onClick={() => setIndex(i)}
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-secondary/40 transition sm:h-20 sm:w-20",
                i === safeIndex
                  ? "border-brand shadow-sm"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <Image src={img} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
