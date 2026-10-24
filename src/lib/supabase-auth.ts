import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { db } from "@/lib/db"
import type { User } from "@prisma/client"

// ============================================================
// SUPABASE AUTH — synchronisation automatique des comptes
// ------------------------------------------------------------
// La boutique possède sa propre authentification sécurisée
// (scrypt + session JWT 30 j, table « User » de la base
// Supabase). Ce module crée en PLUS un compte miroir dans
// le service « Authentication » de Supabase à chaque
// inscription, et rattrape les anciens comptes (comme le
// propriétaire) à leur première connexion : tous les
// comptes deviennent ainsi visibles et gérables dans
// Supabase → Authentication, mot de passe inclus.
//
// SÉCURITÉ : SUPABASE_SERVICE_ROLE_KEY est une clé SERVEUR
// (elle ne figure JAMAIS dans le code client). Tant qu'elle
// n'est pas configurée, la synchronisation est simplement
// ignorée — la boutique fonctionne normalement sans elle.
// ============================================================

/** URL du projet Supabase, ex. https://kwaebthujnkvvbdvpimz.supabase.co */
function supabaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "")
  return url && /^https:\/\/.+\.supabase\.co$/.test(url) ? url : null
}

/** Clé service_role (secrète, serveur uniquement) — absente → mode hors-ligne. */
function serviceKey(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  // Les valeurs placeholder (ex. « À_COLLER_ICI ») ne comptent pas comme configurées
  if (!key || key.length < 40 || /COLLER|xxx|placeholder/i.test(key)) return null
  return key
}

/** La synchronisation est-elle activée ? (affichée aussi sur /api/health) */
export function isSupabaseAuthConfigured(): boolean {
  return Boolean(supabaseUrl() && serviceKey())
}

let clientSingleton: SupabaseClient | null = null
function adminClient(): SupabaseClient | null {
  const url = supabaseUrl()
  const key = serviceKey()
  if (!url || !key) return null
  clientSingleton ??= createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return clientSingleton
}

export type SyncResult = {
  ok: boolean
  status: "synchronise" | "deja_a_jour" | "non_configure" | "echec"
  reason?: string
}

/**
 * Crée ou met à jour le compte miroir « email + mot de passe »
 * dans Supabase → Authentication, puis enregistre l'identifiant
 * Supabase (supabaseAuthId) sur l'utilisateur Prisma.
 *
 * - À l'INSCRIPTION : création du compte (email déjà confirmé).
 * - À la CONNEXION : rattrapage des anciens comptes + maintien du
 *   mot de passe à jour côté Supabase (updatePassword).
 *
 * NE LÈVE JAMAIS D'ERREUR : la boutique doit continuer à
 * fonctionner même si Supabase Auth est absent ou indisponible.
 */
export async function syncUserToSupabaseAuth(
  user: Pick<User, "id" | "email" | "name" | "phone" | "role"> & { supabaseAuthId?: string | null },
  plainPassword: string,
  opts: { updatePassword?: boolean } = {},
): Promise<SyncResult> {
  try {
    const client = adminClient()
    if (!client) return { ok: false, status: "non_configure" }

    const metadata = {
      full_name: user.name,
      phone: user.phone ?? "",
      role: user.role,
      prisma_id: user.id,
      boutique: "Téranga Market",
    }

    // 1) Déjà lié → simple mise à jour du mot de passe (connexion)
    if (user.supabaseAuthId) {
      if (!opts.updatePassword) return { ok: true, status: "deja_a_jour" }
      const { error } = await client.auth.admin.updateUserById(user.supabaseAuthId, {
        password: plainPassword,
        email_confirm: true,
        user_metadata: metadata,
      })
      if (error) {
        // Le compte a pu être supprimé côté dashboard → on retente une création
        if (error.message.toLowerCase().includes("not found")) {
          return await createMirror(client, user, plainPassword, metadata)
        }
        return { ok: false, status: "echec", reason: error.message }
      }
      return { ok: true, status: "synchronise" }
    }

    // 2) Pas encore lié → création (ou rattrapage si créé auparavant)
    return await createMirror(client, user, plainPassword, metadata)
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error)
    console.warn(`[supabase-auth] sync échouée pour ${user.email} : ${reason}`)
    return { ok: false, status: "echec", reason }
  }
}

async function createMirror(
  client: SupabaseClient,
  user: { id: string; email: string; name: string; phone?: string | null; role: string },
  plainPassword: string,
  metadata: Record<string, unknown>,
): Promise<SyncResult> {
  const { data, error } = await client.auth.admin.createUser({
    email: user.email,
    password: plainPassword,
    email_confirm: true, // compte immédiatement actif — aucun serveur email requis
    user_metadata: metadata,
  })

  // Compte déjà présent dans Supabase Auth → on le rattache au lieu d'échouer
  if (error || !data?.user) {
    const msg = (error?.message ?? "réponse vide").toLowerCase()
    if (msg.includes("already") || msg.includes("exist") || msg.includes("registered")) {
      const existing = await findAuthUserByEmail(client, user.email)
      if (!existing) {
        return { ok: false, status: "echec", reason: "compte existant introuvable via l'API" }
      }
      await client.auth.admin.updateUserById(existing.id, {
        password: plainPassword,
        email_confirm: true,
        user_metadata: metadata,
      })
      await saveAuthId(user.id, existing.id)
      return { ok: true, status: "synchronise" }
    }
    return { ok: false, status: "echec", reason: error?.message ?? "réponse vide" }
  }

  await saveAuthId(user.id, data.user.id)
  return { ok: true, status: "synchronise" }
}

/** Recherche un compte Auth par email (pagination, jusqu'à 20 pages de 200). */
async function findAuthUserByEmail(
  client: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) break
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return { id: found.id }
    if (data.users.length < 200) break
  }
  return null
}

async function saveAuthId(prismaId: string, authId: string) {
  try {
    await db.user.update({ where: { id: prismaId }, data: { supabaseAuthId: authId } })
  } catch (error) {
    console.warn(`[supabase-auth] impossible d'enregistrer supabaseAuthId : ${error}`)
  }
}

/**
 * Rattrapage en masse des ANCIENS comptes (script manuel ou tâche de fond) :
 * crée un miroir Supabase Auth pour tous les utilisateurs non encore liés.
 * Le mot de passe étant inconnu (hachage à sens unique), un mot de passe
 * aléatoire solide est posé côté Supabase ; il sera remplacé par le VRAI
 * mot de passe à la première connexion de l'utilisateur (syncUserToSupabaseAuth
 * avec updatePassword).
 */
export async function backfillAllUsers(): Promise<{ total: number; synced: number; failed: number }> {
  const client = adminClient()
  if (!client) return { total: 0, synced: 0, failed: 0 }

  const users = await db.user.findMany({
    where: { supabaseAuthId: null, isActive: true },
    select: { id: true, email: true, name: true, phone: true, role: true },
    orderBy: { createdAt: "asc" },
  })

  let synced = 0
  let failed = 0
  for (const user of users) {
    const randomPassword = `Tm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}!`
    const result = await syncUserToSupabaseAuth({ ...user, supabaseAuthId: null }, randomPassword)
    if (result.ok) synced++
    else failed++
  }
  return { total: users.length, synced, failed }
}
