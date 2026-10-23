import { randomBytes, scryptSync, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"
import { SignJWT, jwtVerify } from "jose"
import { db } from "@/lib/db"
import { ApiError } from "@/lib/api"
import { hasPermissionAsync, type Permission } from "@/lib/rbac"
import { cached } from "@/lib/cache"
import type { User } from "@prisma/client"

export const SESSION_COOKIE = "tm_session"
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 jours — l'utilisateur reste connecté et retrouve son compte sur tous ses appareils

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET manquant dans l'environnement serveur.")
  return new TextEncoder().encode(secret)
}

// ---------- Mots de passe (scrypt, node:crypto — jamais de mot de passe en clair) ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, "hex")
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

// ---------- Sessions (JWT httpOnly signé, revalidation DB à chaque usage sensible) ----------

export async function createSession(user: Pick<User, "id" | "role">) {
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret())

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function destroySession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

/**
 * Retourne l'utilisateur courant (rechargé depuis la DB) ou null.
 *
 * FLUIDITÉ : le rechargement DB est mémoïsé 5 s PAR TOKEN (cache mémoire
 * anti-stampede de @/lib/cache). Un même appelant qui utilise la session
 * plusieurs fois dans une requête (panier, checkout…) ne paie qu'UN SEUL
 * aller-retour Supabase au lieu de 4-5. La clé étant le token JWT lui-même :
 * login/logout changent le token → aucune donnée périmée entre comptes.
 * Fenêtre de fraîcheur max : 5 s sur isActive/rôle ( acceptable vs 7 j de JWT).
 */
export async function getSessionUser(): Promise<User | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (!token) return null
    return await cached(`session:${token}`, 5_000, async () => {
      const { payload } = await jwtVerify(token, getSecret())
      const userId = payload.sub
      if (!userId) return null
      const user = await db.user.findUnique({ where: { id: userId } })
      if (!user || !user.isActive) return null
      return user
    })
  } catch {
    return null
  }
}

/** Exige un utilisateur connecté (client ou staff). */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser()
  if (!user) throw new ApiError("Vous devez être connecté pour effectuer cette action.", 401)
  return user
}

/**
 * Exige un membre du staff avec une permission donnée.
 * La vérification est TOUJOURS côté serveur : rôle rechargé depuis la DB +
 * matrice de permissions EFFECTIVE (surcharges éditées par le propriétaire
 * comprises) à chaque requête.
 */
export async function requireStaff(permission?: Permission): Promise<User> {
  const user = await getSessionUser()
  if (!user) throw new ApiError("Accès refusé : connexion requise.", 401)
  if (!["OWNER", "ADMIN", "MANAGER", "MARKETING", "STAFF"].includes(user.role)) {
    throw new ApiError("Accès refusé : cette action est réservée à l'équipe.", 403)
  }
  if (permission && !(await hasPermissionAsync(user.role, permission))) {
    throw new ApiError("Accès refusé : permission insuffisante pour cette action.", 403)
  }
  return user
}

/** Génère un code de parrainage unique lisible. */
export function generateReferralCode(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, "X")
  return `${base}-${randomBytes(3).toString("hex").toUpperCase()}`
}
