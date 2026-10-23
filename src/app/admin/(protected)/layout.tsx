import { getSessionUser } from "@/lib/auth"
import { permissionsOfAsync } from "@/lib/rbac"
import { AdminShell } from "@/components/admin/shell"
import { ClientOnly } from "@/components/admin/client-only"
import { redirect } from "next/navigation"

/**
 * Garde d'authentification + coquille admin.
 * La sécurité ne repose JAMAIS sur la confidentialité de l'URL /admin :
 * la session est revalidée côté serveur à chaque requête.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect("/admin/login")
  if (!["OWNER", "ADMIN", "MANAGER", "MARKETING", "STAFF"].includes(user.role)) {
    redirect("/")
  }

  // Matrice de permissions éditable par le propriétaire (surcharges DB) :
  const perms = await permissionsOfAsync(user.role)
  const can = (p: string) => perms.includes(p as never)

  const nav = [
    {
      title: "Pilotage",
      items: [
        ...(can("dashboard.view") ? [{ href: "/admin", label: "Tableau de bord", icon: "dashboard" }] : []),
        ...(can("analytics.view") ? [{ href: "/admin/analytics", label: "Statistiques", icon: "analytics" }] : []),
      ],
    },
    {
      title: "Ventes",
      items: [
        ...(can("orders.view") ? [{ href: "/admin/orders", label: "Commandes", icon: "orders" }] : []),
        ...(can("customers.view") ? [{ href: "/admin/customers", label: "Clients (CRM)", icon: "customers" }] : []),
      ],
    },
    {
      title: "Catalogue",
      items: [
        ...(can("products.view") ? [{ href: "/admin/products", label: "Produits", icon: "products" }] : []),
        ...(can("products.view") ? [{ href: "/admin/categories", label: "Catégories", icon: "categories" }] : []),
        ...(can("products.view") ? [{ href: "/admin/collections", label: "Collections", icon: "collections" }] : []),
        ...(can("inventory.manage") ? [{ href: "/admin/inventory", label: "Inventaire", icon: "inventory" }] : []),
      ],
    },
    {
      title: "Marketing",
      items: [
        ...(can("coupons.manage") ? [{ href: "/admin/marketing/coupons", label: "Coupons", icon: "coupons" }] : []),
        ...(can("promotions.manage") ? [{ href: "/admin/marketing/promotions", label: "Promotions X→Y", icon: "promotions" }] : []),
        ...(can("referrals.manage") ? [{ href: "/admin/marketing/referrals", label: "Parrainage", icon: "referrals" }] : []),
        ...(can("referrals.manage") ? [{ href: "/admin/marketing/full-refund", label: "Rembours. intégral", icon: "fullRefund" }] : []),
        ...(can("upsells.manage") ? [{ href: "/admin/marketing/upsells", label: "Upsells", icon: "upsells" }] : []),
        ...(can("campaigns.manage") ? [{ href: "/admin/marketing/abandoned-carts", label: "Paniers abandonnés", icon: "carts" }] : []),
        ...(can("campaigns.manage") ? [{ href: "/admin/marketing/campaigns", label: "Campagnes", icon: "campaigns" }] : []),
        ...(can("reviews.moderate") ? [{ href: "/admin/marketing/reviews", label: "Avis clients", icon: "reviews" }] : []),
      ],
    },
    {
      title: "Boutique",
      items: [
        ...(can("storefront.edit") ? [{ href: "/admin/storefront", label: "Pages & Éditeur", icon: "pages" }] : []),
        ...(can("theme.edit") ? [{ href: "/admin/storefront/theme", label: "Thème", icon: "theme" }] : []),
      ],
    },
    {
      title: "Administration",
      items: [
        ...(can("settings.manage") ? [{ href: "/admin/settings", label: "Paramètres", icon: "settings" }] : []),
        ...(can("settings.manage") ? [{ href: "/admin/settings/payments", label: "Paiements", icon: "payments" }] : []),
        ...(can("settings.manage") ? [{ href: "/admin/settings/shipping", label: "Livraison", icon: "shipping" }] : []),
        ...(can("users.view") ? [{ href: "/admin/users", label: "Utilisateurs", icon: "users" }] : []),
        ...(can("users.view") ? [{ href: "/admin/roles", label: "Rôles & permissions", icon: "roles" }] : []),
        ...(can("activity.view") ? [{ href: "/admin/activity-logs", label: "Journal d'activité", icon: "activity" }] : []),
      ],
    },
  ].filter((g) => g.items.length > 0)

  return (
    <AdminShell
      user={{ name: user.name, role: user.role, permissions: perms as unknown as string[] }}
      nav={nav}
    >
      {/* Barrière client-only : voir src/components/admin/client-only.tsx —
          élimine définitivement les divergences d'hydratation (useId/Radix)
          sur toutes les pages admin sans coût visuel (squelette initial). */}
      <ClientOnly>{children}</ClientOnly>
    </AdminShell>
  )
}
