"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"

/**
 * Wrapper d'animation d'apparition — discret, une seule fois,
 * désactivé si l'utilisateur préfère réduire les animations.
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
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
