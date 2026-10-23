// POST /api/newsletter — inscription newsletter (upsert NewsletterSubscriber).
// 201 à la création, message déjà-inscrit sinon ; email invalide refusé (422).
import { z } from "zod"
import { handle, ok, parseBody } from "@/lib/api"
import { db } from "@/lib/db"
import { enforceRateLimit } from "@/lib/rate-limit"

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email("adresse email invalide"),
  source: z.enum(["footer", "section", "checkout"]).optional(),
})

export async function POST(request: Request) {
  return handle(async () => {
    enforceRateLimit(request, "newsletter", 5, 60_000) // anti spam inscription
    const body = await parseBody(request, bodySchema)

    const existing = await db.newsletterSubscriber.findUnique({ where: { email: body.email } })
    if (existing) {
      return ok({ message: "Vous êtes déjà inscrit(e) à notre newsletter. Merci !", already: true })
    }

    await db.newsletterSubscriber.create({
      data: { email: body.email, source: body.source ?? "section" },
    })
    return ok({ message: "Merci ! Votre inscription est confirmée." }, 201)
  })
}
