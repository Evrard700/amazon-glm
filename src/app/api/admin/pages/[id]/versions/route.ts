import { db } from "@/lib/db"
import { ok, handle, ApiError } from "@/lib/api"
import { requireStaff } from "@/lib/auth"

/** Liste des versions publiées (historique) d'une page. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireStaff("storefront.edit")
    const { id } = await params
    const page = await db.page.findUnique({ where: { id } })
    if (!page) throw new ApiError("Page introuvable.", 404)
    const versions = await db.pageVersion.findMany({ where: { pageId: id }, orderBy: { version: "desc" } })
    return ok(
      versions.map((v) => ({
        id: v.id,
        version: v.version,
        label: v.label,
        createdAt: v.createdAt,
      })),
    )
  })
}
