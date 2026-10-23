"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Download, Gift, LayoutDashboard, LogOut, Loader2, Package, TicketPercent, User, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatXOF } from "@/lib/money"
import { clearCartSnapshot } from "@/lib/cart-store"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/account", label: "Profil", icon: User },
  { href: "/account/orders", label: "Mes commandes", icon: Package },
  { href: "/account/downloads", label: "Téléchargements", icon: Download },
  { href: "/account/referrals", label: "Parrainage", icon: Gift },
  { href: "/account/rewards", label: "Récompenses", icon: TicketPercent },
] as const

/** Bouton de déconnexion autonome (utilisé aussi sur la page Profil). */
export function LogoutButton({ className, variant = "outline" }: { className?: string; variant?: "outline" | "ghost" | "destructive" }) {
  const [loggingOut, setLoggingOut] = useState(false)

  async function logout() {
    setLoggingOut(true)
    try {
      clearCartSnapshot()
      await fetch("/api/auth/logout", { method: "POST" })
      window.location.href = "/"
    } catch {
      setLoggingOut(false)
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      onClick={logout}
      disabled={loggingOut}
      className={cn("gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive", className)}
    >
      {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      {loggingOut ? "Déconnexion…" : "Se déconnecter"}
    </Button>
  )
}

/** Navigation latérale de l'espace client (pills scrollables sur mobile). */
export function AccountNav({ userName, storeCredit, isStaff }: { userName: string; storeCredit: number; isStaff: boolean }) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === "/account" ? pathname === "/account" : pathname.startsWith(href)

  return (
    <nav aria-label="Espace client" className="lg:sticky lg:top-24">
      {/* Mobile : pills horizontales scrollables */}
      <ul className="scrollbar-thin flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {NAV_ITEMS.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition",
                isActive(item.href)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-secondary",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop : carte latérale */}
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm lg:block">
        <div className="border-b bg-brand-soft/60 px-4 py-4">
          <p className="text-sm font-bold">{userName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Wallet className="h-3.5 w-3.5" /> Crédit boutique : {formatXOF(storeCredit)}
          </p>
        </div>
        <ul className="p-2">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  isActive(item.href)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          ))}
          {isStaff && (
            <li className="mt-1 border-t pt-1">
              <Link
                href="/admin"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <LayoutDashboard className="h-4 w-4" /> Administration
              </Link>
            </li>
          )}
        </ul>
        <div className="border-t p-2">
          <LogoutButton variant="ghost" className="w-full justify-start" />
        </div>
      </div>

      {/* Bouton déconnexion mobile */}
      <LogoutButton variant="outline" className="mt-2 rounded-full lg:hidden" />
    </nav>
  )
}
