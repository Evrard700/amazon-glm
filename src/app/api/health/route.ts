import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * Diagnostic public de déploiement — aucune valeur secrète n'est révélée :
 * uniquement « présent / absent / bien formé » + un test réel de connexion.
 * Cache mémoire de 30 s pour éviter les requêtes répétées à la base.
 */
let lastCheck: { at: number; body: Record<string, string> } | null = null

export async function GET() {
  const now = Date.now()
  if (lastCheck && now - lastCheck.at < 30_000) {
    return render(lastCheck.body, now - lastCheck.at)
  }

  const dbUrl = process.env.DATABASE_URL ?? ""
  const secret = process.env.SESSION_SECRET ?? ""

  const body: Record<string, string> = {}

  body["DATABASE_URL"] = !dbUrl
    ? "❌ ABSENTE — ajoutez-la dans Vercel → Settings → Environment Variables"
    : dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://")
      ? "✅ présente et bien formée"
      : "❌ présente mais MAL FORMÉE — elle doit commencer par postgresql://"

  body["SESSION_SECRET"] =
    secret.length >= 32
      ? "✅ présente (32 caractères ou plus)"
      : "❌ ABSENTE ou trop courte (32 caractères minimum)"

  body["NEXT_PUBLIC_SITE_URL (référencement)"] = process.env.NEXT_PUBLIC_SITE_URL
    ? "✅ présente"
    : "⚠️ absente — optionnelle mais recommandée"

  try {
    await db.$queryRaw`SELECT 1`
    body["Connexion à la base de données"] =
      "✅ RÉUSSIE — la boutique peut afficher ses produits"
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error)
    body["Connexion à la base de données"] = `❌ ÉCHEC — ${message}`
  }

  lastCheck = { at: now, body }
  return render(body, 0)
}

function render(body: Record<string, string>, cachedForMs: number) {
  const rows = Object.entries(body)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 14px;border-bottom:1px solid #eee;font-weight:600;white-space:nowrap">${label}</td><td style="padding:8px 14px;border-bottom:1px solid #eee">${value}</td></tr>`,
    )
    .join("")

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diagnostic — Téranga Market</title></head>
<body style="font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#18181b">
<h1 style="font-size:22px">🩺 Diagnostic Téranga Market</h1>
<table style="border-collapse:collapse;background:#fff;border:1px solid #ddd;border-radius:8px">${rows}</table>
<p style="color:#777;font-size:13px;margin-top:18px;line-height:1.5">
Si une ligne affiche ❌ : corrigez la variable dans Vercel → Settings → Environment Variables,
puis Deployments → bouton ⋯ → Redeploy, et rouvrez cette page.${cachedForMs ? ` <em>(résultat mis en cache ${Math.round(cachedForMs / 1000)} s)</em>` : ""}</p>
</body></html>`

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
}
