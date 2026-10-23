// Monnaie : FCFA (XOF) — entiers uniquement, aucun calcul flottant financier.
// Arrondi explicite pour les pourcentages : Math.round ( demi-sup ), documenté.

export function formatXOF(amount: number | null | undefined): string {
  const n = Math.round(Number(amount ?? 0))
  const formatted = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
  return `${formatted} FCFA`
}

export function toMoney(amount: unknown): number {
  return Math.round(Number(amount) || 0)
}

/** Réduction en pourcentage avec règle d'arrondi explicite (Math.round). */
export function percentOf(amount: number, percent: number): number {
  return Math.round((amount * percent) / 100)
}

export function clampAmount(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
