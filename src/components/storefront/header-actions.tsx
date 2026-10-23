"use client"

import { useEffect, useLayoutEffect, useState } from "react"
import Link from "next/link"
import { Menu, Search, ShoppingCart, User, LogIn, Package, TicketPercent, LogOut, LayoutDashboard } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { ClientOnly } from "@/components/storefront/client-only"
import { useCartStore, hydrateCartFromLocal, clearCartSnapshot } from "@/lib/cart-store"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"

export interface HeaderUser {
  name: string
  role: string
  storeCredit: number
}

export function MobileMenu({ categories }: { categories: { name: string; slug: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <ClientOnly
      fallback={
        <span className="inline-flex items-center p-2 lg:hidden" aria-hidden="true">
          <Menu className="h-5 w-5" />
        </span>
      }
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="p-2 lg:hidden" aria-label="Ouvrir le menu">
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="border-b px-4 py-4 text-base font-bold">Catégories</SheetTitle>
          <nav className="flex flex-col gap-1 p-3">
            <Link href="/catalogue" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-secondary">
              Tout le catalogue
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/categories/${cat.slug}`}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm hover:bg-secondary"
              >
                {cat.name}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </ClientOnly>
  )
}

export function CartButton() {
  const { openDrawer, fetchCart, itemCount, subtotal, promotionDiscount, couponDiscount } = useCartStore()

  // INSTANTANÉ : l'instantané local (localStorage) est appliqué AVANT le
  // premier affichage → badge et montant corrects immédiatement, sans
  // attendre /api/cart. La revalidation ci-dessous corrige ensuite en fond.
  useLayoutEffect(() => {
    hydrateCartFromLocal()
  }, [])

  useEffect(() => {
    fetchCart()
  }, [fetchCart])

  const total = Math.max(0, subtotal - promotionDiscount - couponDiscount)

  return (
    <button
      onClick={openDrawer}
      className="group relative flex items-center gap-2 rounded-lg bg-brand px-2.5 py-1.5 text-sm font-semibold text-brand-foreground shadow-sm transition hover:brightness-95 sm:px-3"
      aria-label={`Ouvrir le panier, ${itemCount} article(s)`}
    >
      <ShoppingCart className="h-5 w-5" />
      <span className="hidden sm:inline">{itemCount > 0 ? formatXOF(total) : "Panier"}</span>
      {itemCount > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-bold text-background">
          {itemCount}
        </span>
      )}
    </button>
  )
}

export function AccountMenu({ user }: { user: HeaderUser | null }) {
  const [loading, setLoading] = useState(false)
  const isStaff = user && user.role !== "CUSTOMER"

  if (!user) {
    return (
      <div className="flex items-center gap-1.5">
        <Link
          href="/login"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-secondary"
        >
          <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">Connexion</span>
        </Link>
      </div>
    )
  }

  return (
    <ClientOnly
      fallback={
        <span className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium" aria-hidden="true">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold uppercase text-primary-foreground">
            {user.name.slice(0, 1)}
          </span>
          <span className="hidden max-w-28 truncate md:inline">{user.name}</span>
        </span>
      }
    >
      <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-secondary">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold uppercase text-primary-foreground">
            {user.name.slice(0, 1)}
          </span>
          <span className="hidden max-w-28 truncate md:inline">{user.name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-semibold">{user.name}</div>
          {user.storeCredit > 0 && (
            <div className="text-xs font-medium text-emerald-600">Crédit : {formatXOF(user.storeCredit)}</div>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account"><User className="h-4 w-4" /> Mon compte</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/orders"><Package className="h-4 w-4" /> Mes commandes</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/rewards"><TicketPercent className="h-4 w-4" /> Mes récompenses</Link>
        </DropdownMenuItem>
        {isStaff && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin"><LayoutDashboard className="h-4 w-4" /> Administration</Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            setLoading(true)
            clearCartSnapshot()
            await fetch("/api/auth/logout", { method: "POST" })
            window.location.href = "/"
          }}
          disabled={loading}
        >
          <LogOut className="h-4 w-4" /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>
    </ClientOnly>
  )
}

export function MobileSearchButton() {
  return (
    <Link href="/catalogue" className="p-2 md:hidden" aria-label="Rechercher">
      <Search className="h-5 w-5" />
    </Link>
  )
}
