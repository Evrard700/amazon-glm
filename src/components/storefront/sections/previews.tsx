"use client"

// Aperçus statiques (éditeur visuel — Task 4) : rendu crédible SANS accès DB.
// Contrat : chaque preview reçoit { props } et se contente de maquettes.

import { CheckCircle2, Play, Star, Package, Mail } from "lucide-react"
import { str, num, recordList } from "./section-ui"

type PreviewProps = { props: Record<string, unknown> }

function Frame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-lg border bg-background text-foreground shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}

// ---------- HERO ----------
export function HeroPreview({ props }: PreviewProps) {
  const align = str(props.align, "left") === "center" ? "center" : "left"
  return (
    <Frame>
      <div className="relative bg-zinc-900 px-5 py-8 text-white">
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-400/30 blur-2xl" />
        <div className={align === "center" ? "text-center" : ""}>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">Téranga Market</p>
          <p className="mt-1 text-lg font-extrabold leading-snug">{str(props.title, "Titre principal de la une")}</p>
          {str(props.subtitle) && <p className="mt-1 text-xs text-white/75">{str(props.subtitle)}</p>}
          <div className={`mt-3 flex gap-2 ${align === "center" ? "justify-center" : ""}`}>
            {str(props.ctaLabel) && (
              <span className="rounded bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-zinc-900">
                {str(props.ctaLabel)}
              </span>
            )}
            {str(props.ctaLabel2) && (
              <span className="rounded border border-white/30 px-3 py-1.5 text-[11px] font-semibold">
                {str(props.ctaLabel2)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Frame>
  )
}

// ---------- USP BAR ----------
const USP_ICONS: Record<string, string> = {
  truck: "🚚",
  shield: "🛡️",
  refresh: "🔄",
  headset: "🎧",
  gift: "🎁",
  percent: "％",
  star: "⭐",
}
export function UspBarPreview({ props }: PreviewProps) {
  const items = recordList(props.items)
  return (
    <Frame className="p-3">
      <div className="grid grid-cols-2 gap-2">
        {(items.length ? items : [{ icon: "truck", title: "Livraison rapide", text: "24–72 h" }]).map((it, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border bg-card p-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-amber-100 text-sm">
              {USP_ICONS[str(it.icon, "truck")] ?? "🚚"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold">{str(it.title, "Avantage")}</p>
              <p className="truncate text-[10px] text-muted-foreground">{str(it.text)}</p>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  )
}

// ---------- CATEGORIES ----------
export function CategoriesPreview({ props }: PreviewProps) {
  const count = Math.max(1, Math.min(6, num(props.count, 6)))
  return (
    <Frame className="p-3">
      <p className="mb-2 text-xs font-bold">{str(props.title, "Explorez par catégorie")}</p>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-md border">
            <div className="aspect-[4/3] bg-zinc-200" />
            <p className="truncate bg-card px-1 py-1 text-center text-[10px] font-medium">Catégorie {i + 1}</p>
          </div>
        ))}
      </div>
    </Frame>
  )
}

// ---------- PRODUCT GRID ----------
export function ProductGridPreview({ props }: PreviewProps) {
  const cols = Math.max(2, Math.min(4, num(props.columns, 4)))
  return (
    <Frame className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold">{str(props.title, "Sélection de produits")}</p>
        <span className="text-[10px] font-semibold text-amber-600">Tout voir →</span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: Math.min(4, cols) }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-md border bg-card">
            <div className="relative aspect-square bg-zinc-200">
              <Package className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-zinc-400" />
            </div>
            <div className="space-y-1 p-1.5">
              <div className="h-2 w-4/5 rounded bg-zinc-300" />
              <div className="h-2 w-3/5 rounded bg-zinc-200" />
              <p className="text-[10px] font-bold">12 500 FCFA</p>
              <div className="rounded bg-amber-500 py-1 text-center text-[9px] font-bold text-zinc-900">
                Ajouter au panier
              </div>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  )
}

// ---------- PROMO BANNER ----------
export function PromoBannerPreview({ props }: PreviewProps) {
  return (
    <Frame>
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-5 py-4"
        style={{ backgroundColor: str(props.background, "#18181b"), color: str(props.textColor, "#fafaf9") }}
      >
        <div className="min-w-0">
          <p className="text-sm font-extrabold">{str(props.title, "Promotion du moment")}</p>
          {str(props.text) && <p className="text-[11px] opacity-80">{str(props.text)}</p>}
        </div>
        {str(props.ctaLabel) && (
          <span
            className="rounded-md px-3 py-1.5 text-[11px] font-bold"
            style={{ backgroundColor: str(props.textColor, "#fafaf9"), color: str(props.background, "#18181b") }}
          >
            {str(props.ctaLabel)}
          </span>
        )}
      </div>
    </Frame>
  )
}

// ---------- COLLECTION HIGHLIGHT ----------
export function CollectionHighlightPreview({ props }: PreviewProps) {
  return (
    <Frame className="p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid aspect-[4/3] place-items-center rounded-md bg-zinc-200 text-zinc-400">
          <Package className="h-7 w-7" />
        </div>
        <div className="flex flex-col justify-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Collection</p>
          <p className="text-sm font-extrabold leading-tight">{str(props.title, "Collection en vedette")}</p>
          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
            {str(props.text, "Description courte de la collection sélectionnée.")}
          </p>
          {str(props.ctaLabel) && (
            <span className="mt-2 w-fit rounded bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-zinc-900">
              {str(props.ctaLabel, "Découvrir")}
            </span>
          )}
        </div>
      </div>
    </Frame>
  )
}

// ---------- TESTIMONIALS ----------
export function TestimonialsPreview({ props }: PreviewProps) {
  const items = recordList(props.items)
  const stars = (r: unknown) => Math.max(1, Math.min(5, num(r, 5)))
  return (
    <Frame className="p-3">
      <p className="mb-2 text-xs font-bold">{str(props.title, "Ils nous font confiance")}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {(items.length ? items.slice(0, 3) : [{ name: "Client", city: "Ville", text: "Super !", rating: 5 }]).map(
          (it, i) => (
            <div key={i} className="rounded-md border bg-card p-2">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: stars(it.rating) }).map((_, j) => (
                  <Star key={j} className="h-3 w-3 fill-amber-500 stroke-amber-500" />
                ))}
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] italic">« {str(it.text, "Témoignage client")} »</p>
              <p className="mt-1 text-[10px] font-semibold">
                {str(it.name, "Nom")} {str(it.city) && <span className="font-normal text-muted-foreground">— {str(it.city)}</span>}
              </p>
            </div>
          ),
        )}
      </div>
    </Frame>
  )
}

// ---------- FAQ ----------
export function FaqPreview({ props }: PreviewProps) {
  const items = recordList(props.items)
  return (
    <Frame className="p-3">
      <p className="mb-2 text-xs font-bold">{str(props.title, "Questions fréquentes")}</p>
      <div className="divide-y rounded-md border bg-card">
        {(items.length ? items.slice(0, 3) : [{ q: "Une question ?", a: "Une réponse claire." }]).map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-2 px-2.5 py-2">
            <p className="truncate text-[11px] font-medium">{str(it.q, "Question")}</p>
            <span className="text-[10px] text-muted-foreground">+</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

// ---------- RICH TEXT ----------
export function RichTextPreview({ props }: PreviewProps) {
  return (
    <Frame className="p-3">
      <p className="text-xs font-bold">{str(props.title, "Titre du bloc texte")}</p>
      <div className="mt-1.5 space-y-1">
        <div className="h-2 w-full rounded bg-zinc-200" />
        <div className="h-2 w-11/12 rounded bg-zinc-200" />
        <div className="h-2 w-3/4 rounded bg-zinc-200" />
      </div>
      <p className="mt-2 line-clamp-2 text-[10px] text-muted-foreground">
        {str(props.html).replace(/<[^>]+>/g, "").slice(0, 120) || "Contenu enrichi (HTML autorisé, scripts retirés)."}
      </p>
    </Frame>
  )
}

// ---------- VIDEO ----------
export function VideoPreview({ props }: PreviewProps) {
  return (
    <Frame className="p-3">
      <p className="mb-2 text-xs font-bold">{str(props.title, "Vidéo de présentation")}</p>
      <div className="grid aspect-video place-items-center rounded-md bg-zinc-900">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-500 text-zinc-900">
          <Play className="h-4 w-4 fill-zinc-900" />
        </span>
      </div>
      {str(props.description) && (
        <p className="mt-1.5 line-clamp-1 text-[10px] text-muted-foreground">{str(props.description)}</p>
      )}
    </Frame>
  )
}

// ---------- COUNTDOWN ----------
export function CountdownPreview({ props }: PreviewProps) {
  const endsAt = str(props.endsAt)
  const soon = new Date(Date.now() + 3 * 86400000).toISOString()
  const label = endsAt ? new Date(endsAt).toLocaleDateString("fr-FR") : new Date(soon).toLocaleDateString("fr-FR")
  return (
    <Frame className="p-3">
      <div className="rounded-md bg-zinc-900 px-4 py-3 text-center text-white">
        <p className="text-xs font-extrabold">{str(props.title, "Offre limitée")}</p>
        {str(props.text) && <p className="text-[10px] text-white/70">{str(props.text)}</p>}
        <div className="mt-2 flex justify-center gap-1.5" style={{ opacity: endsAt ? 1 : 0.55 }}>
          {["03", "08", "42", "17"].map((v, i) => (
            <span key={i} className="rounded bg-white/10 px-1.5 py-1 text-[10px] font-bold tabular-nums">
              {v}
            </span>
          ))}
        </div>
        <p className="mt-1 text-[9px] text-white/50">Se termine le {label}</p>
        {str(props.ctaLabel) && (
          <span className="mt-2 inline-block rounded bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-zinc-900">
            {str(props.ctaLabel, "J'en profite")}
          </span>
        )}
      </div>
    </Frame>
  )
}

// ---------- LOGOS ----------
export function LogosPreview({ props }: PreviewProps) {
  const items = recordList(props.items)
  return (
    <Frame className="p-3">
      <p className="mb-2 text-center text-xs font-bold">{str(props.title, "Ils nous accompagnent")}</p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {(items.length ? items.slice(0, 6) : [{ name: "Partenaire" }]).map((it, i) => (
          <span key={i} className="rounded-full border bg-card px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
            {str(it.name, "Logo")}
          </span>
        ))}
      </div>
    </Frame>
  )
}

// ---------- REVIEWS ----------
export function ReviewsPreview({ props }: PreviewProps) {
  return (
    <Frame className="p-3">
      <p className="mb-2 text-xs font-bold">{str(props.title, "Derniers avis clients")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: Math.max(1, Math.min(3, num(props.count, 3))) }).map((_, i) => (
          <div key={i} className="rounded-md border bg-card p-2">
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 rounded bg-zinc-200" />
              <div>
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="h-2.5 w-2.5 fill-amber-500 stroke-amber-500" />
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground">Produit · il y a 2 j</p>
              </div>
              <CheckCircle2 className="ml-auto h-3 w-3 text-emerald-600" />
            </div>
            <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
              « Produit conforme à la description, livraison ultra rapide. Je recommande ! »
            </p>
          </div>
        ))}
      </div>
    </Frame>
  )
}

// ---------- NEWSLETTER ----------
export function NewsletterPreview({ props }: PreviewProps) {
  return (
    <Frame className="p-3">
      <div className="rounded-md bg-zinc-900 p-4 text-center text-white">
        <Mail className="mx-auto h-5 w-5 text-amber-400" />
        <p className="mt-1.5 text-xs font-extrabold">{str(props.title, "Recevez nos offres en avant-première")}</p>
        {str(props.text) && <p className="text-[10px] text-white/70">{str(props.text)}</p>}
        <div className="mx-auto mt-2 flex max-w-[240px] gap-1.5">
          <div className="h-7 flex-1 rounded border border-white/20 bg-white/10" />
          <span className="grid h-7 w-16 place-items-center rounded bg-amber-500 text-[9px] font-bold text-zinc-900">
            {str(props.ctaLabel, "S'inscrire")}
          </span>
        </div>
      </div>
    </Frame>
  )
}

// ---------- SEO TEXT ----------
export function SeoTextPreview({ props }: PreviewProps) {
  return (
    <Frame className="p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {str(props.title, "Texte SEO")}
      </p>
      <p className="mt-1 line-clamp-4 text-[10px] leading-relaxed text-muted-foreground">
        {str(props.text, "Paragraphe d'information pour le référencement naturel…") || "Paragraphe d'information pour le référencement naturel…"}
      </p>
    </Frame>
  )
}
