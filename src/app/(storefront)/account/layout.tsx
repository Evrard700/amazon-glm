import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import { AccountNav } from "@/components/storefront/account-nav"

export const metadata = { title: "Mon espace client" }

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect("/login?next=/account")

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:py-8">
      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        <AccountNav
          userName={user.name}
          storeCredit={user.storeCredit}
          isStaff={user.role !== "CUSTOMER"}
        />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
