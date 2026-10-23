import { db } from "@/lib/db"
import { CartPageView } from "@/components/storefront/cart-page"

export const metadata = { title: "Mon panier" }

export default async function CartPage() {
  const settings = await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:py-8">
      <CartPageView freeShippingThreshold={settings.freeShippingThreshold} />
    </div>
  )
}
