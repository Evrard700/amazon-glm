import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import type { User } from "@prisma/client"

/**
 * Garde d'accès des pages de l'espace client : redirige vers /login avec le
 * chemin demandé en paramètre `next` pour y revenir après connexion.
 * (Utilisé en complément du layout /account qui impose une session.)
 */
export async function requireUserPage(nextPath: string): Promise<User> {
  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  return user
}
