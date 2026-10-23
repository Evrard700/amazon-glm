import { ok, handle } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { permissionsOfAsync } from "@/lib/rbac"

/** Profil du membre du staff courant + permissions EFFECTIVES (matrice éditable). */
export async function GET() {
  return handle(async () => {
    const user = await requireStaff()
    return ok({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: await permissionsOfAsync(user.role),
      },
    })
  })
}
