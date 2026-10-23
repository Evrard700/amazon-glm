"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Activity,
  BadgePercent,
  BarChart3,
  Boxes,
  Brush,
  Circle,
  CreditCard,
  FolderTree,
  Gift,
  Layers,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Package,
  Palette,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  TicketPercent,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/storefront/logo"
import { ROLE_LABELS } from "@/lib/constants"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  label: string
  // Clé d'icône : les composants ne peuvent pas traverser la frontière serveur → client.
  icon: string
}

/** Résolution des clés d'icônes côté client (la sidebar est pilotée par le layout serveur). */
const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  analytics: BarChart3,
  orders: ShoppingCart,
  customers: Users,
  products: Package,
  categories: FolderTree,
  collections: Layers,
  inventory: Boxes,
  coupons: TicketPercent,
  promotions: Gift,
  referrals: Share2,
  fullRefund: BadgePercent,
  upsells: TrendingUp,
  carts: ShoppingBag,
  campaigns: Megaphone,
  reviews: Star,
  pages: Palette,
  theme: Brush,
  settings: Settings,
  payments: CreditCard,
  shipping: Truck,
  users: UserCog,
  roles: ShieldCheck,
  activity: Activity,
}
interface NavGroup {
  title: string
  items: NavItem[]
}

export function AdminShell({
  user,
  nav,
  children,
}: {
  user: { name: string; role: string; permissions: string[] }
  nav: NavGroup[]
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/admin/login")
    router.refresh()
  }

  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b px-4 py-4">
        <Logo className="h-9 w-9" />
        <div className="leading-tight">
          <p className="text-sm font-extrabold tracking-tight">Téranga Admin</p>
          <p className="text-[11px] text-muted-foreground">Console de gestion</p>
        </div>
      </div>
      <nav className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {nav.map((group) => (
          <div key={group.title}>
            <p className="px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))
                const Icon = NAV_ICONS[item.icon] ?? Circle
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-brand-soft font-semibold text-brand-foreground"
                          : "text-foreground/80 hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.8} />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t p-3">
        <div className="flex items-center gap-2 rounded-lg bg-secondary/60 px-2.5 py-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold uppercase text-primary-foreground">
            {user.name.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout} aria-label="Se déconnecter">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <Link
          href="/"
          target="_blank"
          className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <Store className="h-3.5 w-3.5" /> Voir la boutique
        </Link>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-sidebar lg:block">{Sidebar}</aside>

      {/* Sidebar mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r bg-sidebar shadow-xl">{Sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <button className="p-1.5 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu">
            <Menu className="h-5 w-5" />
          </button>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Console d'administration — <span className="font-medium text-foreground">{user.name}</span>
          </p>
          <div className="ml-auto text-xs text-muted-foreground">
            Montants en FCFA
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
        <footer className="mt-auto border-t px-6 py-4 text-center text-xs text-muted-foreground">
          Téranga Admin — toutes les actions sont vérifiées et journalisées.
        </footer>
      </div>
    </div>
  )
}

export function AdminSidebarBackdrop() {
  return null
}

export { X as AdminMenuClose }
