import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { randomBytes } from "crypto"
import { handle, ok, ApiError } from "@/lib/api"
import { getSessionUser } from "@/lib/auth"
import { hasPermissionAsync } from "@/lib/rbac"
import { logActivity } from "@/lib/activity"

// ============================================================
// UPLOAD D'IMAGES ADMIN (produits, éditeur visuel, thème…)
// Répond au contrat de src/lib/upload-client.ts :
//   FormData "file"  →  { ok: true, data: { url, fileName, mime, size } }
// Stockage : public/uploads/ (URL publique /uploads/<nom>).
// Sécurité : session staff requise + permission (produits OU
// éditeur OU thème), liste blanche MIME (PAS de svg : risque
// XSS), poids limité, nom de fichier aléatoire (aucune écriture
// contrôlée par l'utilisateur, extension forcée par le MIME).
// ============================================================

export const dynamic = "force-dynamic"

/** 8 Mo maximum — largement assez pour une photo produit. */
const MAX_BYTES = 8 * 1024 * 1024

/** MIME autorisés → extension imposée (jamais celle du nom d'origine). */
const IMAGE_MIMES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await getSessionUser()
    if (!user || !["OWNER", "ADMIN", "MANAGER", "MARKETING", "STAFF"].includes(user.role)) {
      throw new ApiError("Accès refusé : connexion équipe requise.", 401)
    }
    // Une seule de ces permissions suffit (formulaire produit, éditeur visuel ou thème).
    const granted = await Promise.all([
      hasPermissionAsync(user.role, "products.manage"),
      hasPermissionAsync(user.role, "storefront.edit"),
      hasPermissionAsync(user.role, "theme.edit"),
    ])
    if (!granted.some(Boolean)) {
      throw new ApiError("Accès refusé : permission insuffisante pour envoyer des images.", 403)
    }

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File) || file.size === 0) {
      throw new ApiError("Aucun fichier reçu.", 400)
    }
    const ext = IMAGE_MIMES[file.type]
    if (!ext) {
      throw new ApiError(
        "Format non pris en charge. Utilisez JPG, PNG, WebP, GIF ou AVIF.",
        415,
      )
    }
    if (file.size > MAX_BYTES) {
      throw new ApiError("Image trop lourde : 8 Mo maximum.", 413)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileName = `img-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.${ext}`

    // En production standalone, process.cwd() pointe vers .next/standalone
    // (public/ y est copié au build) : les écritures restent cohérentes.
    const dir = path.join(process.cwd(), "public", "uploads")
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, fileName), buffer)

    await logActivity({
      actor: { id: user.id, name: user.name, role: user.role },
      action: "upload.image",
      entityType: "upload",
      entityId: fileName,
      details: { mime: file.type, size: file.size },
    })

    return ok({ url: `/uploads/${fileName}`, fileName, mime: file.type, size: file.size })
  })
}
