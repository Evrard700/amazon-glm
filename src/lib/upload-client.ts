"use client"

// ============================================================
// HELPER D'UPLOAD COTÉ CLIENT — partagé par toutes les interfaces
// admin (produit, sections, thème, catégories, collections…).
// STABILITÉ : le JSON de la réponse est analysé DE FAÇON SÛRE —
// si une route renvoie du texte (404 dev, page d'erreur, proxy),
// l'utilisateur reçoit un message français clair au lieu du
// célèbre « Unexpected token 'S', "Server act…" is not valid JSON ».
// ============================================================

export interface UploadedImage {
  url: string
  fileName?: string
  mime?: string
  size?: number
}

export interface UploadedDigital {
  fileName: string
  displayName: string
  size?: number
}

/** Parse sécurisé : renvoie du JSON ou soulève une ApiError française lisible. */
async function safeJson(res: Response): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const text = await res.text()
  try {
    const parsed = JSON.parse(text) as { ok?: boolean; data?: unknown; error?: string }
    return { ok: Boolean(parsed?.ok), data: parsed?.data, error: parsed?.error }
  } catch {
    throw new Error(
      res.ok
        ? "Réponse du serveur illisible — réessayez dans un instant."
        : `Le serveur a refusé l'envoi (HTTP ${res.status}). Réessayez.`,
    )
  }
}

/** Envoie un fichier vers /api/admin/upload/image — renvoie l'URL publique. */
export async function uploadImage(file: File): Promise<UploadedImage> {
  const fd = new FormData()
  fd.append("file", file)
  const res = await fetch("/api/admin/upload/image", { method: "POST", body: fd })
  const json = await safeJson(res)
  if (!json.ok || !json.data) throw new Error(json.error ?? "Échec de l'envoi de l'image.")
  return json.data as UploadedImage
}

/** Envoie un fichier numérique vers /api/admin/upload/digital. */
export async function uploadDigital(file: File): Promise<UploadedDigital> {
  const fd = new FormData()
  fd.append("file", file)
  const res = await fetch("/api/admin/upload/digital", { method: "POST", body: fd })
  const json = await safeJson(res)
  if (!json.ok || !json.data) throw new Error(json.error ?? "Échec de l'envoi du fichier.")
  return json.data as UploadedDigital
}
