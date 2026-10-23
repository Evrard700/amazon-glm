import { readFile } from "fs/promises"
import path from "path"
import { SignJWT, jwtVerify } from "jose"
import { db } from "@/lib/db"
import { ApiError } from "@/lib/api"
import { logActivity } from "@/lib/activity"

/**
 * FICHIERS NUMÉRIQUES — accès sécurisé :
 *  - stockage hors de public/ (storage/digital/) : aucune URL publique permanente ;
 *  - droit vérifié à CHAQUE téléchargement (grant actif + limite non dépassée) ;
 *  - jeton signé à durée courte (10 min) généré uniquement pour un bénéficiaire vérifié ;
 *  - journal des téléchargements (DownloadLog).
 */

const STORAGE_DIR = path.join(process.cwd(), "storage", "digital")

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new ApiError("Configuration serveur manquante.", 500)
  return new TextEncoder().encode(secret)
}

/** Demande de téléchargement : vérifie le droit et délivre un lien à jeton court. */
export async function requestDownload(grantId: string, userId: string) {
  const grant = await db.digitalDownloadGrant.findUnique({
    where: { id: grantId },
    include: { orderItem: { include: { order: true, product: true } }, user: true },
  })
  if (!grant) throw new ApiError("Accès introuvable.", 404)
  if (grant.userId !== userId) throw new ApiError("Ce téléchargement ne vous appartient pas.", 403)
  if (grant.revoked) throw new ApiError("Cet accès a été révoqué (commande annulée ou remboursée).", 403)
  if (grant.downloadCount >= grant.limitCount) {
    throw new ApiError(
      `Limite de ${grant.limitCount} téléchargements atteinte pour ce fichier. Contactez le support.`,
      409,
    )
  }
  const order = grant.orderItem.order
  if (order.paymentStatus !== "PAYMENT_PAID") {
    throw new ApiError("Le paiement de la commande doit être confirmé pour accéder au fichier.", 402)
  }
  const product = await db.product.findUnique({ where: { id: grant.orderItem.productId } })
  if (!product?.digitalFileUrl) throw new ApiError("Fichier introuvable pour ce produit.", 404)

  const token = await new SignJWT({ grantId, userId, file: product.digitalFileUrl })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getSecret())

  return {
    url: `/api/downloads/file?grant=${grantId}&token=${token}`,
    fileName: product.digitalFileName ?? product.digitalFileUrl,
    remaining: grant.limitCount - grant.downloadCount - 1,
  }
}

/** Sert le fichier après vérification du jeton — incrémente le compteur et journalise. */
export async function serveDigitalFile(grantId: string, token: string, ip: string | null, userAgent: string | null) {
  let payload: { grantId: string; userId: string; file: string }
  try {
    const verified = await jwtVerify(token, getSecret())
    payload = verified.payload as unknown as { grantId: string; userId: string; file: string }
  } catch {
    throw new ApiError("Lien de téléchargement expiré ou invalide. Redemandez l'accès.", 403)
  }
  if (payload.grantId !== grantId) throw new ApiError("Jeton invalide pour ce fichier.", 403)

  const grant = await db.digitalDownloadGrant.findUnique({ where: { id: grantId } })
  if (!grant) throw new ApiError("Accès introuvable.", 404)
  if (grant.revoked) throw new ApiError("Cet accès a été révoqué.", 403)
  if (grant.downloadCount >= grant.limitCount) throw new ApiError("Limite de téléchargements atteinte.", 409)

  // LECTURE DU FICHIER AVANT de consommer le quota : si le fichier est absent
  // (404), le compteur et le journal ne sont PAS décrémentés — le client peut
  // réessayer sans perdre un téléchargement.
  const filePath = path.join(STORAGE_DIR, path.basename(payload.file))
  const buffer = await readFile(filePath).catch(() => {
    throw new ApiError("Fichier introuvable sur le serveur.", 404)
  })

  await db.digitalDownloadGrant.update({ where: { id: grantId }, data: { downloadCount: { increment: 1 } } })
  await db.downloadLog.create({
    data: { grantId, userId: grant.userId, ip, userAgent },
  })
  await logActivity({
    actor: null,
    action: "digital.download",
    entityType: "grant",
    entityId: grantId,
    details: { file: payload.file },
  })

  return { buffer, fileName: payload.file }
}
