// SQLite : colonnes String pour les payloads JSON. Helpers sûrs de sérialisation.

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null)
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
