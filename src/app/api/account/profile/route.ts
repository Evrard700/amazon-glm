import { z } from "zod"
import { db } from "@/lib/db"
import { ok, handle, parseBody } from "@/lib/api"
import { requireUser } from "@/lib/auth"
import { logActivity } from "@/lib/activity"

/** Mise à jour du profil client par son propriétaire uniquement. */
const schema = z.object({
  name: z.string().min(2, "nom trop court").max(80),
  phone: z.string().max(20).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
})

export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser()
    const body = await parseBody(request, schema)

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        address: body.address?.trim() || null,
        city: body.city?.trim() || null,
      },
    })

    await logActivity({
      actor: { id: user.id, name: user.name, role: user.role },
      action: "account.profile_update",
      entityType: "user",
      entityId: user.id,
      details: { name: updated.name },
    })

    return ok({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        address: updated.address,
        city: updated.city,
        storeCredit: updated.storeCredit,
      },
    })
  })
}
