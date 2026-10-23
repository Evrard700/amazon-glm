import { readFile, stat } from "fs/promises"
import path from "path"
import { NextResponse } from "next/server"

// ============================================================
// SERVICE DES FICHIERS TÉLÉVERSÉS PAR L'ADMIN (/uploads/…)
//
// POURQUOI CETTE ROUTE : en production (build standalone), le
// serveur statique de Next.js ne sert QUE les fichiers présents
// dans public/ AU MOMENT DU BUILD (manifeste figé). Les images
// envoyées plus tard via /api/admin/upload/image existent sur
// le disque mais renverraient 404.
// → Les fichiers connus au build restent servis par le chemin
//   statique (rapide) ; les nouveaux tombent ici et sont lus
//   directement sur le disque.
//
// SÉCURITÉ : un seul segment, nom de fichier sanitisé (aucune
// traversée de répertoire possible), pas de fichier caché.
// ============================================================

export const dynamic = "force-dynamic"

/** Noms acceptés : lettres, chiffres, tirets, points, underscore. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
}

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params

  // Un seul segment plat : /uploads/<fichier> — tout le reste est refusé.
  if (segments.length !== 1) {
    return new NextResponse("Introuvable", { status: 404 })
  }
  const name = segments[0]
  if (!SAFE_NAME.test(name) || name.includes("..")) {
    return new NextResponse("Introuvable", { status: 404 })
  }

  // Lecture depuis public/uploads (même dossier que la route d'upload).
  const filePath = path.join(process.cwd(), "public", "uploads", name)

  try {
    // stat d'abord : un dossier ou un fichier caché ne doit jamais partir.
    const info = await stat(filePath)
    if (!info.isFile()) return new NextResponse("Introuvable", { status: 404 })

    const buffer = await readFile(filePath)
    const ext = path.extname(name).toLowerCase()
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream"

    // Les noms sont aléatoires et le contenu immuable : cache long.
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=2592000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new NextResponse("Introuvable", { status: 404 })
  }
}
