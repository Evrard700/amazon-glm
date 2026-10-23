"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Wrapper d'apparition — CSS pur (IntersectionObserver + transition),
 * une seule fois, désactivé si l'utilisateur préfère réduire les animations
 * (règle .reveal-motion dans globals.css : visible immédiatement).
 * Remplace framer-motion whileInView : mêmes valeurs (opacity 0→1,
 * translateY y→0, 400 ms ease-out, déclenchement unique au scroll).
 */
export function Reveal({
  children,
  delay = 0,
  y = 8,
  className,
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Équivalent de viewport={{ once: true }} : on observe puis on se débranche
    // dès la première intersection (marge basse proche de l'ancien "-40px").
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn("reveal-motion", visible && "reveal-visible", className)}
      style={
        {
          "--reveal-y": `${y}px`,
          transitionDelay: delay > 0 ? `${delay}s` : undefined,
        } as CSSProperties
      }
    >
      {children}
    </div>
  )
}
