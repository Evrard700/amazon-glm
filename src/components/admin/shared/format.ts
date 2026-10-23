import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns"
import { fr } from "date-fns/locale"

/** Helpers de formatage de dates FR pour l'admin (client-safe). */

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—"
  return format(new Date(date), "d MMM yyyy 'à' HH:mm", { locale: fr })
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—"
  return format(new Date(date), "d MMM yyyy", { locale: fr })
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return "—"
  const d = new Date(date)
  if (isToday(d)) return `Aujourd'hui à ${format(d, "HH:mm", { locale: fr })}`
  if (isYesterday(d)) return `Hier à ${format(d, "HH:mm", { locale: fr })}`
  return formatDistanceToNow(d, { locale: fr, addSuffix: true })
}

export function formatDayShort(date: string | Date): string {
  return format(new Date(date), "d MMM", { locale: fr })
}

/** Clé de jour YYYY-MM-DD (heure locale) pour agréger par jour. */
export function dayKey(date: string | Date): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
