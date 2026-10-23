import Link from "next/link"
import Image from "next/image"
import { getSessionUser } from "@/lib/auth"
import { getCategories, getSettings } from "@/lib/catalog-data"
import { CartDrawer } from "@/components/storefront/cart-drawer"
import { SearchBar } from "@/components/storefront/search-bar"
import { AccountMenu, CartButton, MobileMenu, type HeaderUser } from "@/components/storefront/header-actions"
import { Logo } from "@/components/storefront/logo"

async function getStoreData() {
  // Settings + catégories via le cache mémoire (anti-stampede) — 0 requête à chaud.
  const [settings, allCategories, user] = await Promise.all([
    getSettings(),
    getCategories(),
    getSessionUser(),
  ])
  // Mêmes contraintes que la requête d'origine : racines actives, position croissante, 7 max.
  const categories = allCategories.filter((c) => c.parentId === null).slice(0, 7)
  return { settings, categories, user }
}

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const { settings, categories, user } = await getStoreData()

  const headerUser: HeaderUser | null = user
    ? { name: user.name, role: user.role, storeCredit: user.storeCredit }
    : null

  const vars = {
    "--brand": settings?.accentColor ?? "#f59e0b",
    "--primary": settings?.primaryColor ?? "#18181b",
  } as React.CSSProperties

  return (
    <div
      className="flex min-h-screen flex-col bg-background"
      style={vars}
    >
      {/* Bandeau d'annonce */}
      {settings?.announcementActive && settings.announcementText && (
        <div className="bg-primary px-4 py-1.5 text-center text-xs font-medium tracking-wide text-primary-foreground">
          {settings.announcementText}
        </div>
      )}

      <header className="sticky top-0 z-40 w-full border-b bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
        {/* Barre principale */}
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-4">
          <MobileMenu categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />
          <Link href="/" className="flex items-center gap-2" aria-label="Téranga Market — Accueil">
            <Logo className="h-9 w-9" />
            <span className="hidden flex-col leading-none sm:flex">
              <span className="text-lg font-extrabold tracking-tight">{settings?.storeName ?? "Téranga Market"}</span>
              <span className="text-[11px] font-medium text-muted-foreground">
                {settings?.tagline ?? "Le meilleur du shopping"}
              </span>
            </span>
          </Link>
          <div className="mx-auto hidden w-full max-w-xl md:block">
            <SearchBar />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <AccountMenu user={headerUser} />
            <CartButton />
          </div>
        </div>
        {/* Barre de recherche mobile */}
        <div className="border-t px-4 py-2 md:hidden">
          <SearchBar />
        </div>
        {/* Navigation catégories */}
        <nav className="hidden border-t lg:block" aria-label="Catégories">
          <ul className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-1.5">
            <li>
              <Link href="/catalogue" className="block rounded-md px-3 py-1.5 text-sm font-semibold hover:bg-secondary">
                Tout le catalogue
              </Link>
            </li>
            {categories.map((cat) => (
              <li key={cat.id}>
                <Link href={`/categories/${cat.slug}`} className="block whitespace-nowrap rounded-md px-3 py-1.5 text-sm hover:bg-secondary">
                  {cat.name}
                </Link>
              </li>
            ))}
            <li className="ml-auto">
              <Link href="/account/referrals" className="rounded-md px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                🎁 Gagnez avec le parrainage
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto border-t bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Logo className="h-8 w-8" light />
              <span className="text-lg font-extrabold">{settings?.storeName ?? "Téranga Market"}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-primary-foreground/75">
              {settings?.footerAbout ??
                "Votre marketplace de confiance : qualité garantie, paiement à la livraison possible, support réactif 7j/7."}
            </p>
          </div>
          <nav aria-label="Boutique">
            <h3 className="text-sm font-bold uppercase tracking-wider opacity-90">Boutique</h3>
            <ul className="mt-3 space-y-2 text-sm text-primary-foreground/75">
              <li><Link href="/catalogue" className="hover:underline">Catalogue</Link></li>
              <li><Link href="/account/orders" className="hover:underline">Suivre ma commande</Link></li>
              <li><Link href="/account/referrals" className="hover:underline">Programme de parrainage</Link></li>
              <li><Link href="/pages/a-propos" className="hover:underline">À propos</Link></li>
            </ul>
          </nav>
          <nav aria-label="Aide">
            <h3 className="text-sm font-bold uppercase tracking-wider opacity-90">Aide</h3>
            <ul className="mt-3 space-y-2 text-sm text-primary-foreground/75">
              <li><Link href="/pages/faq" className="hover:underline">Questions fréquentes</Link></li>
              <li><Link href="/pages/cgv" className="hover:underline">Conditions générales</Link></li>
              <li><Link href="/pages/livraison" className="hover:underline">Livraison & retours</Link></li>
              <li><Link href="/pages/politique-confidentialite" className="hover:underline">Politique de confidentialité</Link></li>
            </ul>
          </nav>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider opacity-90">Contact</h3>
            <ul className="mt-3 space-y-2 text-sm text-primary-foreground/75">
              <li><Link href="/pages/contact" className="font-medium text-primary-foreground hover:underline">Nous contacter</Link></li>
              {settings?.contactPhone && <li>📞 {settings.contactPhone}</li>}
              {settings?.contactEmail && <li>✉️ {settings.contactEmail}</li>}
              {settings?.whatsappNumber && <li>💬 WhatsApp {settings.whatsappNumber}</li>}
              {settings?.addressLine && <li>📍 {settings.addressLine}</li>}
            </ul>
          </div>
        </div>
        <div className="border-t border-primary-foreground/15 py-4 text-center text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} {settings?.storeName ?? "Téranga Market"}. Tous droits réservés. — Prix en FCFA (XOF)
        </div>
      </footer>

      <CartDrawer />
    </div>
  )
}
