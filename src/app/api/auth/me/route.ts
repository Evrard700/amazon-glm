import { ok, handle } from "@/lib/api"
import { getSessionUser } from "@/lib/auth"

export async function GET() {
  return handle(async () => {
    const user = await getSessionUser()
    if (!user) return ok({ user: null })
    return ok({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        city: user.city,
        storeCredit: user.storeCredit,
        referralCode: user.referralCode,
        marketingConsent: user.marketingConsent,
      },
    })
  })
}
