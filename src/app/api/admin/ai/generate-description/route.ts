import { z } from "zod"
import { ok, handle, parseBody, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import ZAI from "z-ai-web-dev-sdk"

const schema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(["PHYSICAL", "DIGITAL", "HYBRID"]),
  keyPoints: z.string().max(400).optional(),
})

/**
 * Assistant IA : génère une description commerciale de produit.
 * Réservé au staff (permission products.manage). z-ai-web-dev-sdk : backend uniquement.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireStaff("products.manage")
    const body = await parseBody(request, schema)

    try {
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "Tu es un rédacteur e-commerce professionnel pour une boutique en ligne africaine moderne. Rédige en français, ton chaleureux et vendeur, sans exagération mensongère. Réponds STRICTEMENT en JSON : {\"shortDescription\": \"...\", \"description\": \"...\"}. shortDescription : 1 phrase (max 140 caractères). description : 2 à 3 paragraphes avec des retours à la ligne, avantages concrets, et une mention des usages. Ne mentionne jamais de prix ni de remise.",
          },
          {
            role: "user",
            content: `Produit : ${body.name}\nType : ${body.type}\nPoints clés à valoriser : ${body.keyPoints || "qualité, fiabilité, rapport qualité-prix"}`,
          },
        ],
      })
      const content = completion.choices[0]?.message?.content ?? ""
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new ApiError("Réponse IA inutilisable.", 502)
      const parsed = JSON.parse(jsonMatch[0]) as { shortDescription?: string; description?: string }
      if (!parsed.description) throw new ApiError("Réponse IA incomplète.", 502)
      return ok({
        shortDescription: parsed.shortDescription ?? "",
        description: parsed.description,
      })
    } catch (error) {
      if (error instanceof ApiError) throw error
      console.error("[ai]", error)
      throw new ApiError("Le générateur IA est momentanément indisponible. Réessayez.", 502)
    }
  })
}
