import { NextResponse } from "next/server"
import { ZodError, type ZodType } from "zod"

/** Erreur métier avec statut HTTP — utilisée par tous les services API. */
export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status })
}

export class ValidationError extends ApiError {
  constructor(message = "Données invalides") {
    super(message, 422)
  }
}

/** Enveloppe un handler de route API avec gestion d'erreurs standardisée. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ApiError) {
      return fail(error.message, error.status, error.code)
    }
    if (error instanceof ZodError) {
      const first = error.issues[0]
      return fail(
        `Données invalides : ${first?.path?.join(".") ?? ""} — ${first?.message ?? "erreur de validation"}`,
        422,
      )
    }
    console.error("[api]", error)
    return fail("Une erreur interne est survenue. Veuillez réessayer.", 500)
  }
}

/** Parse et valide un corps JSON avec Zod, message d'erreur lisible en français. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new ApiError("Corps de requête JSON invalide.", 400)
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new ApiError(
      `Champ « ${first?.path?.join(".") ?? "inconnu"} » : ${first?.message ?? "invalide"}`,
      422,
    )
  }
  return result.data
}

/** Lecture sûre d'un paramètre query en entier. */
export function queryInt(request: Request, key: string, fallback: number): number {
  const url = new URL(request.url)
  const raw = url.searchParams.get(key)
  if (raw === null) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isNaN(n) ? fallback : n
}
