/**
 * RATTRAPAGE SUPABASE AUTH — Téranga Market
 * ============================================================
 * Crée le compte miroir dans Supabase → Authentication pour
 * TOUS les utilisateurs existants de la boutique (y compris le
 * compte du propriétaire).
 *
 * Le mot de passe réel étant inconnu (hachage à sens unique),
 * un mot de passe aléatoire solide est posé côté Supabase ; il
 * sera automatiquement remplacé par le VRAI mot de passe à la
 * première connexion de chaque utilisateur.
 *
 * Usage : bun scripts/sync-supabase-auth.ts
 * Prérequis : NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans .env
 */
import { backfillAllUsers, isSupabaseAuthConfigured } from "../src/lib/supabase-auth"

async function main() {
  if (!isSupabaseAuthConfigured()) {
    console.log("")
    console.log("❌ Supabase Auth n'est pas encore configuré.")
    console.log("")
    console.log("   Pour activer la sauvegarde automatique des comptes :")
    console.log("   1. Ouvrez https://supabase.com/dashboard → votre projet")
    console.log("      (kwaebthujnkvvbdvpimz) → Settings (Paramètres) → API")
    console.log("   2. Copiez la « Project URL » dans NEXT_PUBLIC_SUPABASE_URL du fichier .env")
    console.log("   3. Copiez la clé secrète « service_role » dans SUPABASE_SERVICE_ROLE_KEY du fichier .env")
    console.log("   4. Relancez : bun scripts/sync-supabase-auth.ts")
    console.log("")
    process.exit(1)
  }

  console.log("🔄 Rattrapage : enregistrement des comptes existants dans Supabase → Authentication…")
  const { total, synced, failed } = await backfillAllUsers()

  console.log("")
  console.log(`✅ Terminé : ${synced}/${total} compte(s) enregistré(s) dans Supabase Authentication.`)
  if (failed > 0) console.log(`⚠️  ${failed} compte(s) en échec — relancez le script ou consultez les journaux.`)
  console.log("")
  console.log("   Vérification : Supabase → Authentication → Users (la liste complète y figure).")
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error("❌ Erreur inattendue :", error)
  process.exit(1)
})
