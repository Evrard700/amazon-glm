import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { ok, handle, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { enforceRateLimit } from "@/lib/rate-limit"
import { logActivity } from "@/lib/activity"

// ============================================================
// UPLOAD D'IMAGES (produits, catégories, collections, sections,
// thème) — POST multipart/form-data, champ « file ».
//  - réservé au staff connecté (RBAC) + rate limiting ;
//  - MIME + signature binaire vérifiés (pas de confiance au nom
//    client) : jpeg, png, webp, gif, avif ;
//  - 8 Mo max, nom généré par le serveur, stocké dans
//    public/uploads/ (URL publique directe /uploads/…).
// ============================================================

const MAX_BYTES = 8 * 1024 * 1024

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}

/** Vérifie la signature binaire réelle du fichier (magic bytes). */
function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png"
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif"
  // RIFF....WEBP
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp"
  }
  // ISO-BMFF « ftyp » (offset 4) avec marqueur avif
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
    if (brand.startsWith("avi")) return "image/avif"
  }
  return null
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireStaff()
    enforceRateLimit(request, "upload:image", 40, 10 * 60 * 1000)

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      throw new ApiError("Requête multipart invalide.", 400)
    }
    const file = form.get("file")
    if (!(file instanceof File)) throw new ApiError("Aucun fichier reçu (champ « file » requis).", 400)

    if (file.size === 0) throw new ApiError("Le fichier est vide.", 422)
    if (file.size > MAX_BYTES) throw new ApiError("Image trop lourde (8 Mo maximum).", 413)

    const declaredMime = file.type || (MIME_EXT[path.extname(file.name).toLowerCase()] ? `image/${MIME_EXT[path.extname(file.name).toLowerCase()]}` : "")
    if (!declaredMime || !MIME_EXT[declaredMime]) {
      throw new ApiError("Format non pris en charge. Utilisez JPG, PNG, WebP, GIF ou AVIF.", 415)
    }

    const buffer = new Uint8Array(await file.arrayBuffer())
    const sniffed = sniffMime(buffer)
    if (!sniffed || !MIME_EXT[sniffed]) {
      throw new ApiError("Le contenu du fichier n'est pas une image valide.", 415)
    }

    // Nom généré par le serveur — aucune confiance au nom client.
    const ext = MIME_EXT[sniffed]
    const stamp = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 8)
    const fileName = `img-${stamp}-${rand}.${ext}`

    const dir = path.join(process.cwd(), "public", "uploads")
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, fileName), buffer)

    void logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "upload.image",
      entityType: "media",
      entityId: fileName,
      details: { size: file.size, mime: sniffed },
    }).catch(() => undefined)

    return ok({ url: `/uploads/${fileName}`, fileName, mime: sniffed, size: file.size }, 201)
  })
}
