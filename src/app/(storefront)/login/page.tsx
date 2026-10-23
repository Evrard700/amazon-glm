import { LoginForm } from "@/components/storefront/login-form"

export const metadata = { title: "Connexion" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return <LoginForm next={next} />
}
