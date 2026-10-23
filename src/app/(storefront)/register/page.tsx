import { db } from "@/lib/db"
import { RegisterForm } from "@/components/storefront/register-form"

export const metadata = { title: "Créer un compte" }

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; next?: string }>
}) {
  const { ref, next } = await searchParams

  // ?ref=CODE : pré-remplissage + validation immédiate côté serveur
  // (mêmes règles d'éligibilité que attachReferrer : rôle client/owner, actif)
  let referrerName: string | null = null
  if (ref) {
    const referrer = await db.user.findUnique({ where: { referralCode: ref.trim().toUpperCase() } })
    if (referrer && referrer.isActive && ["CUSTOMER", "OWNER"].includes(referrer.role)) {
      referrerName = referrer.name
    }
  }

  return <RegisterForm initialReferral={ref} initialReferrerName={referrerName} next={next} />
}
