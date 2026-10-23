import { db } from "@/lib/db"
import { handle, ok } from "@/lib/api"
import { requireAnyPermission } from "../_lib/helpers"

/**
 * GET /api/admin/marketing/clients
 * Liste légère de clients (id, nom, e-mail) pour le ciblage des coupons
 * et la récupération des paniers. Aucune donnée sensible au-delà du CRM de base.
 */
export async function GET() {
  return handle(async () => {
    await requireAnyPermission([
      "customers.view",
      "coupons.manage",
      "campaigns.manage",
      "referrals.manage",
    ])

    const clients = await db.user.findMany({
      where: { role: "CUSTOMER", isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        storeCredit: true,
        createdAt: true,
      },
    })

    return ok(
      clients.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        storeCredit: c.storeCredit,
        createdAt: c.createdAt,
      })),
    )
  })
}
