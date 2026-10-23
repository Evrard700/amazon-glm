import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { ok, handle, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { enforceRateLimit } from "@/lib/rate-limit"
import { logActivity } from "@/lib/activity"

// ============================================================
// UPLOAD DE FICHIERS NUMÉRIQUES (produits numériques/hybrides) —
// POST multipart/form-data, champ « file ».
//  - réservé au staff avec « products.manage » + rate limiting ;
//  - extensions contrôlées (pdf, epub, zip, mp3, mp4, doc…) ;
//  - 25 Mo max ; nom de stockage généré par le serveur, rangé
//    dans storage/digital/ (HORS public/ — accès uniquement via
//    jeton court délivré après vérification de la commande) ;
//  - renvoie { fileName, displayName } utilisés par le formulaire
//    produit (digitalFileUrl = fileName).
// ============================================================

const MAX_BYTES = 25 * 1024 * 1024

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  zip: "application/zip",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
}

/** Nom d'affichage lisible, sans caractères dangereux ni double extension. */
function safeDisplayName(raw: string): string {
  const base = raw.normalize("NFC").replace(/\.[^.]*$/, "").slice(0, 80).replace(/[^\p{L}\p{N} _'’-]/gu, "").trim()
  return base || "fichier"
}

/** Préfixes d'octets attendus pour les formats à signature binaire. */
const MAGIC: Record<string, number[][]> = {
  pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  zip: [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]], // PK..
  epub: [[0x50, 0x4b, 0x03, 0x04]], // epub = zip
  docx: [[0x50, 0x4b, 0x03, 0x04]],
  xlsx: [[0x50, 0x4b, 0x03, 0x04]],
  pptx: [[0x50, 0x4b, 0x03, 0x04]],
  doc: [[0xd0, 0xcf, 0x11, 0xe0]], // OLE2
  xls: [[0xd0, 0xcf, 0x11, 0xe0]],
  ppt: [[0xd0, 0xcf, 0x11, 0xe0]],
  mp3: [[0x49, 0x44, 0x33], [0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2]], // ID3 / sync
}

function matchesMagic(bytes: Uint8Array, signatures: number[][]): boolean {
  return signatures.some((sig) => sig.every((b, i) => bytes[i] === b))
}

/**
 * Vérifie que le CONTENU correspond à l'extension déclarée. txt/epub tolérés
 * sans signature stricte ; mp4 doit contenir « ftyp » dans les 12 premiers
 * octets (offset variable). Tout exécutable (MZ 0x4d5a) est refusé d'office.
 */
function sniffDigitalAllowed(bytes: Uint8Array, ext: string): boolean {
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) return false // exécutable Windows/Linux
  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return false // ELF
  if (ext === "txt") return true // pas de signature possible
  if (ext === "epub") return matchesMagic(bytes, MAGIC.epub)
  if (ext === "mp4") {
    for (let i = 4; i < Math.min(11, bytes.length - 3); i++) {
      if (bytes[i] === 0x66 && bytes[i + 1] === 0x74 && bytes[i + 2] === 0x79 && bytes[i + 3] === 0x70) return true
    }
    return false
  }
  const allowed = MAGIC[ext]
  if (!allowed) return true // format sans table : confiance à l'extension contrôlée ci-dessus
  return matchesMagic(bytes, allowed)
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireStaff("products.manage")
    enforceRateLimit(request, "upload:digital", 20, 10 * 60 * 1000)

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      throw new ApiError("Requête multipart invalide.", 400)
    }
    const file = form.get("file")
    if (!(file instanceof File)) throw new ApiError("Aucun fichier reçu (champ « file » requis).", 400)

    if (file.size === 0) throw new ApiError("Le fichier est vide.", 422)
    if (file.size > MAX_BYTES) throw new ApiError("Fichier trop lourd (25 Mo maximum).", 413)

    const ext = path.extname(file.name).replace(".", "").toLowerCase()
    const mime = EXT_MIME[ext]
    if (!mime) {
      throw new ApiError(
        "Type de fichier non autorisé. Formats acceptés : PDF, EPUB, ZIP, MP3, MP4, DOC(X), XLS(X), PPT(X), TXT.",
        415,
      )
    }
    if (file.type && file.type !== "application/octet-stream" && !file.type.startsWith(mime.split("/")[0]) && !file.type.includes(ext === "docx" || ext === "xlsx" || ext === "pptx" ? "officedocument" : ext)) {
      throw new ApiError("Le type déclaré ne correspond pas à l'extension.", 415)
    }

    const buffer = new Uint8Array(await file.arrayBuffer())

    // SNIFFING BINAIRE minimal (le type déclaré ne suffit pas) : vérifie que
    // le contenu correspond bien à un format numérique autorisé. Un binaire
    // renommé « .zip » est refusé. TXT/EPUB restent légitimes sans signature.
    if (!sniffDigitalAllowed(buffer, ext)) {
      throw new ApiError("Le contenu du fichier ne correspond pas à un format numérique autorisé.", 415)
    }

    // Nom de stockage généré — le nom client n'est JAMAIS utilisé tel quel.
    const stamp = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 8)
    const displayName = safeDisplayName(file.name)
    const fileName = `${displayName.toLowerCase().replace(/\s+/g, "-").slice(0, 40) || "fichier"}-${stamp}-${rand}.${ext}`

    const dir = path.join(process.cwd(), "storage", "digital")
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, fileName), buffer)

    void logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "upload.digital",
      entityType: "media",
      entityId: fileName,
      details: { size: file.size, mime },
    }).catch(() => undefined)

    return ok({ fileName, displayName: `${displayName}.${ext}`, size: file.size }, 201)
  })
}
