import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { randomBytes } from "crypto"
import { handle, ok, ApiError } from "@/lib/api"
import { getSessionUser } from "@/lib/auth"
import { hasPermissionAsync } from "@/lib/rbac"
import { logActivity } from "@/lib/activity"

// ============================================================
// UPLOAD DE FICHIERS NUMÉRIQUES ADMIN (produits téléchargeables)
// Répond au contrat de src/lib/upload-client.ts :
//   FormData "file"  →  { ok: true, data: { fileName, displayName, size } }
//   - fileName    = nom STOCKÉ dans storage/digital/ (sert de
//                   digitalFileUrl côté base — jamais public) ;
//   - displayName = nom d'origine lisible (digitalFileName).
// Stockage HORS de public/ : accès uniquement via jeton signé
// (src/lib/services/digital.ts). Extensions en liste blanche,
// poids limité, nom aléatoire (aucun nom contrôlé par l'utilisateur).
// ============================================================

export const dynamic = "force-dynamic"

/** 64 Mo maximum — confortable pour un pack PDF/vidéo de formation. */
const MAX_BYTES = 64 * 1024 * 1024

/** Extensions autorisées (minuscules) pour un produit numérique. */
const ALLOWED_EXTS = new Set([
  "pdf",
  "zip",
  "epub",
  "mp3",
  "mp4",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
])

export async function POST(request: Request) {
  return handle(async () => {
    const user = await getSessionUser()
    if (!user || !["OWNER", "ADMIN", "MANAGER", "MARKETING", "STAFF"].includes(user.role)) {
      throw new ApiError("Accès refusé : connexion équipe requise.", 401)
    }
    if (!(await hasPermissionAsync(user.role, "products.manage"))) {
      throw new ApiError("Accès refusé : permission insuffisante pour envoyer des fichiers.", 403)
    }

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File) || file.size === 0) {
      throw new ApiError("Aucun fichier reçu.", 400)
    }
    if (file.size > MAX_BYTES) {
      throw new ApiError("Fichier trop lourd : 64 Mo maximum.", 413)
    }

    // Nom d'origine : on ne garde que l'extension (validée) comme suffixe.
    const originalName = file.name || "fichier"
    const ext = originalName.includes(".")
      ? originalName.split(".").pop()!.toLowerCase()
      : ""
    if (!ext || !ALLOWED_EXTS.has(ext)) {
      throw new ApiError(
        "Type de fichier non pris en charge. Formats acceptés : PDF, ZIP, EPUB, MP3, MP4, DOC(X), XLS(X), PPT(X), TXT, CSV.",
        415,
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const storedName = `prod-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.${ext}`

    // En production standalone, storage/ est copié dans .next/standalone
    // au build : process.cwd() reste le bon répertoire de travail.
    const dir = path.join(process.cwd(), "storage", "digital")
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, storedName), buffer)

    await logActivity({
      actor: { id: user.id, name: user.name, role: user.role },
      action: "upload.digital",
      entityType: "upload",
      entityId: storedName,
      details: { displayName: originalName, size: file.size },
    })

    return ok({
      fileName: storedName,
      displayName: originalName,
      size: file.size,
    })
  })
}
