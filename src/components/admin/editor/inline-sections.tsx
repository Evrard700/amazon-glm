"use client"

// ============================================================================
// RENDERERS INLINE « ÉDITION DIRECTE » — reproduisent fidèlement le style des
// sections publiques (src/components/storefront/sections/*.tsx) à échelle
// réelle, en annotant chaque zone éditable :
//   data-tm-field="title"            → champ scalaire (clé de props)
//   data-tm-item-field="items.0.q"   → champ d'un élément de liste (chemin)
//   data-tm-image="image"            → zone de dépôt d'image (clé de props)
//   data-tm-list="items"             → conteneur d'une liste d'éléments
//   data-tm-item-add / -remove       → boutons +/- par élément
// Le moteur d'overlay (inline-canvas.tsx) intercepte les clics sur ces zones
// et ouvre l'éditeur flottant correspondant — façon Elementor/Shopify.
// Les sections alimentées par la base (grilles produits, catégories, avis)
// affichent des cartes de démonstration réalistes : leurs zones éditables
// (titres, compteurs) sont réelles, les données produits vivent dans l'admin.
// ============================================================================

import type { CSSProperties } from "react"
import { CheckCircle2, Package, Play, Star } from "lucide-react"
import { str, num, recordList } from "@/components/storefront/sections/section-ui"
import { sanitizeHtml } from "@/components/storefront/sections/rich-text"
import { cn } from "@/lib/utils"

type P = { props: Record<string, unknown> }

const USP_ICONS: Record<string, string> = {
  truck: "🚚", shield: "🛡️", refresh: "🔄", headset: "🎧", gift: "🎁", percent: "％", star: "⭐",
}

function Field({
  k,
  className,
  style,
  children,
  title,
}: {
  k: string
  className?: string
  style?: CSSProperties
  children?: React.ReactNode
  title?: string
}) {
  return (
    <span data-tm-field={k} title={title} className={className} style={style}>
      {children}
    </span>
  )
}

function ItemField({ k, className, style, children }: { k: string; className?: string; style?: CSSProperties; children?: React.ReactNode }) {
  return (
    <span data-tm-item-field={k} className={className} style={style}>
      {children}
    </span>
  )
}

/** Chip +/- affichée à droite de chaque élément de liste au survol de la section. */
function ListControls({ list, index }: { list: string; index: number }) {
  return (
    <span className="tm-list-controls" data-tm-list={list} data-tm-index={index} contentEditable={false}>
      <button type="button" data-tm-item-remove className="tm-item-remove" aria-label="Supprimer cet élément" tabIndex={-1}>−</button>
    </span>
  )
}

/** Bouton « + Ajouter » affiché sous chaque liste au survol. */
function AddItem({ list, label }: { list: string; label: string }) {
  return (
    <span className="tm-list-controls tm-list-addrow" contentEditable={false}>
      <button type="button" data-tm-item-add={list} className="tm-item-add" tabIndex={-1}>+ Ajouter {label}</button>
    </span>
  )
}

/** Zone de dépôt / remplacement d'image. */
function ImageZone({ k, src, className, style, label = "Image", ratio = "aspect-[16/9]" }: { k: string; src?: string; className?: string; style?: CSSProperties; label?: string; ratio?: string }) {
  return (
    <span
      data-tm-image={k}
      data-tm-empty={src ? undefined : "1"}
      className={cn("relative block overflow-hidden", !src && ratio, className)}
      style={style}
      title={`${label} — cliquez pour choisir, ou glissez une image ici`}
    >
      {src ? (
         
        <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="grid h-full w-full place-items-center bg-zinc-200 text-zinc-400">
          <Package className="h-8 w-8" />
        </span>
      )}
      <span className="tm-image-hint">{src ? "Changer" : "Choisir"} l'image</span>
    </span>
  )
}

const CONTAINER = "relative mx-auto w-full max-w-7xl px-4"

// ---------------------------------------------------------------------------
// 1. HERO
// ---------------------------------------------------------------------------
export function InlineHero({ props }: P) {
  const title = str(props.title, "Le meilleur du shopping, livré chez vous.")
  const subtitle = str(props.subtitle)
  const ctaLabel = str(props.ctaLabel)
  const ctaLabel2 = str(props.ctaLabel2)
  const image = str(props.image)
  const center = str(props.align, "left") === "center"
  const overlay = num(props.overlay, 55, 0, 90)
  return (
    <section data-tm-image="image" className="relative isolate overflow-hidden bg-primary text-primary-foreground">
      {image ? (
        <>
          { }
          <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          <div className="absolute inset-0 bg-primary" style={{ opacity: overlay / 100 }} aria-hidden />
        </>
      ) : (
        <div className="absolute inset-0" aria-hidden>
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand/25 blur-3xl" />
          <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        </div>
      )}
      <div className={cn("relative py-16 sm:py-24 lg:py-28", center && "text-center")}>
        <div className="mx-auto max-w-7xl px-4">
          <div className={cn("max-w-2xl", center && "mx-auto")}>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Téranga Market</p>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              <Field k="title">{title}</Field>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-primary-foreground/85 sm:text-lg">
              <Field k="subtitle">{subtitle || "—"}</Field>
            </p>
            <div className={cn("mt-8 flex flex-wrap items-center gap-3", center && "justify-center")}>
              {ctaLabel && (
                <span className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-bold text-brand-foreground shadow-lg">
                  <Field k="ctaLabel">{ctaLabel}</Field>
                </span>
              )}
              {ctaLabel2 && (
                <span className="inline-flex items-center rounded-lg border border-primary-foreground/30 bg-primary-foreground/5 px-5 py-3 text-sm font-semibold text-primary-foreground backdrop-blur">
                  <Field k="ctaLabel2">{ctaLabel2}</Field>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 2. USP BAR
// ---------------------------------------------------------------------------
export function InlineUspBar({ props }: P) {
  const items = recordList(props.items)
  return (
    <section className="border-b bg-card">
      <div className={cn(CONTAINER, "grid grid-cols-2 gap-3 py-6 sm:grid-cols-4 lg:gap-6")}>
        {(items.length ? items : [{ icon: "truck", title: "Livraison rapide", text: "24–72 h" }]).map((it, i) => (
          <div key={i} className="tm-item relative flex items-center gap-3 rounded-lg">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft text-lg">
              {USP_ICONS[str(it.icon, "truck")] ?? "🚚"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">
                <ItemField k={`items.${i}.title`}>{str(it.title, "Avantage")}</ItemField>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <ItemField k={`items.${i}.text`}>{str(it.text)}</ItemField>
              </p>
            </div>
            <ListControls list="items" index={i} />
          </div>
        ))}
      </div>
      <AddItem list="items" label="avantage" />
    </section>
  )
}

// ---------------------------------------------------------------------------
// 3. CATEGORIES (données réelles en boutique — cartes de démonstration)
// ---------------------------------------------------------------------------
export function InlineCategories({ props }: P) {
  const count = Math.max(1, Math.min(12, num(props.count, 6)))
  return (
    <section className="bg-background py-12">
      <div className={CONTAINER}>
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
          <Field k="title">{str(props.title, "Explorez par catégorie")}</Field>
        </h2>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border bg-card text-center">
              <div className="aspect-[4/3] bg-zinc-200" />
              <p className="truncate px-2 py-2 text-xs font-semibold text-muted-foreground">Catégorie {i + 1}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">※ En boutique, cette grille affiche vos catégories réelles avec leurs images.</p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 4. PRODUCT GRID (données réelles en boutique — cartes de démonstration)
// ---------------------------------------------------------------------------
export function InlineProductGrid({ props }: P) {
  const cols = Math.max(2, Math.min(4, num(props.columns, 4)))
  const count = Math.max(1, Math.min(12, num(props.count, 8)))
  return (
    <section className="bg-background py-12">
      <div className={CONTAINER}>
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
            <Field k="title">{str(props.title, "Coups de cœur de la semaine")}</Field>
          </h2>
          <span className="text-sm font-semibold text-brand">Tout voir →</span>
        </div>
        <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: Math.min(count, cols * 2) }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border bg-card transition hover:shadow-md">
              <div className="relative aspect-square bg-zinc-200">
                <Package className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-zinc-400" />
              </div>
              <div className="space-y-1.5 p-3">
                <div className="h-3.5 w-4/5 rounded bg-zinc-300" />
                <div className="h-3 w-3/5 rounded bg-zinc-200" />
                <p className="pt-1 text-sm font-extrabold">12 500 FCFA</p>
                <div className="rounded-lg bg-brand py-2 text-center text-xs font-bold text-brand-foreground">Ajouter au panier</div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">※ En boutique, cette grille affiche vos produits réels selon la source choisie.</p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 5. PROMO BANNER
// ---------------------------------------------------------------------------
export function InlinePromoBanner({ props }: P) {
  const image = str(props.image)
  const bg = str(props.background, "#f59e0b")
  const fg = str(props.textColor, "#18181b")
  return (
    <section data-tm-image="image" className="relative overflow-hidden" style={{ backgroundColor: bg, color: fg }}>
      {image && (
        <>
          { }
          <img src={image} alt="" className="absolute right-0 top-0 h-full w-1/3 object-cover opacity-30" draggable={false} />
        </>
      )}
      <div className={cn(CONTAINER, "flex flex-wrap items-center justify-between gap-4 py-10")}>
        <div className="max-w-2xl">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            <Field k="title">{str(props.title, "Promotion du moment")}</Field>
          </h2>
          <p className="mt-1 text-sm opacity-80 sm:text-base">
            <Field k="text">{str(props.text)}</Field>
          </p>
        </div>
        {str(props.ctaLabel) && (
          <span className="rounded-lg px-5 py-3 text-sm font-bold shadow-lg" style={{ backgroundColor: fg, color: bg }}>
            <Field k="ctaLabel">{str(props.ctaLabel)}</Field>
          </span>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 6. COLLECTION HIGHLIGHT
// ---------------------------------------------------------------------------
export function InlineCollectionHighlight({ props }: P) {
  const image = str(props.image)
  return (
    <section className="bg-background py-12">
      <div className={cn(CONTAINER, "grid items-center gap-8 lg:grid-cols-2")}>
        <ImageZone k="image" src={image} ratio="aspect-[4/3]" className="rounded-2xl border" label="Image de la collection" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Collection</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            <Field k="title">{str(props.title, "Collection en vedette")}</Field>
          </h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            <Field k="text">{str(props.text, "Une sélection pensée pour vous.")}</Field>
          </p>
          {str(props.ctaLabel) && (
            <span className="mt-6 inline-flex rounded-lg bg-brand px-5 py-3 text-sm font-bold text-brand-foreground shadow-lg">
              <Field k="ctaLabel">{str(props.ctaLabel, "Voir la collection")}</Field>
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 7. TESTIMONIALS
// ---------------------------------------------------------------------------
export function InlineTestimonials({ props }: P) {
  const items = recordList(props.items)
  const stars = (r: unknown) => Math.max(1, Math.min(5, num(r, 5)))
  return (
    <section className="bg-secondary/40 py-12">
      <div className={CONTAINER}>
        <h2 className="text-center text-xl font-extrabold tracking-tight sm:text-2xl">
          <Field k="title">{str(props.title, "Ils nous font confiance")}</Field>
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(items.length ? items.slice(0, 6) : [{ name: "Client", city: "Ville", text: "Super !", rating: 5 }]).map((it, i) => (
            <figure key={i} className="tm-item relative rounded-xl border bg-card p-5">
              <div className="flex gap-0.5">
                {Array.from({ length: stars(it.rating) }).map((_, j) => (
                  <Star key={j} className="h-4 w-4 fill-amber-500 stroke-amber-500" />
                ))}
              </div>
              <blockquote className="mt-3 text-sm italic leading-relaxed">
                « <ItemField k={`items.${i}.text`}>{str(it.text, "Témoignage client")}</ItemField> »
              </blockquote>
              <figcaption className="mt-3 text-sm font-bold">
                <ItemField k={`items.${i}.name`}>{str(it.name, "Nom")}</ItemField>{" "}
                <span className="font-normal text-muted-foreground">— <ItemField k={`items.${i}.city`}>{str(it.city, "Ville")}</ItemField></span>
              </figcaption>
              <ListControls list="items" index={i} />
            </figure>
          ))}
        </div>
        <AddItem list="items" label="témoignage" />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 8. FAQ
// ---------------------------------------------------------------------------
export function InlineFaq({ props }: P) {
  const items = recordList(props.items)
  return (
    <section className="bg-background py-12">
      <div className={cn(CONTAINER, "max-w-3xl")}>
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
          <Field k="title">{str(props.title, "Questions fréquentes")}</Field>
        </h2>
        <div className="mt-6 space-y-3">
          {(items.length ? items : [{ q: "Une question ?", a: "Une réponse claire." }]).map((it, i) => (
            <details key={i} className="tm-item relative group rounded-xl border bg-card open:bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
                <ItemField k={`items.${i}.q`}>{str(it.q, "Question")}</ItemField>
                <span className="text-lg font-light text-muted-foreground transition group-open:rotate-45">+</span>
              </summary>
              <p className="border-t p-4 pt-3 text-sm leading-relaxed text-muted-foreground">
                <ItemField k={`items.${i}.a`}>{str(it.a, "Réponse")}</ItemField>
              </p>
              <ListControls list="items" index={i} />
            </details>
          ))}
        </div>
        <AddItem list="items" label="question" />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 9. RICH TEXT
// ---------------------------------------------------------------------------
export function InlineRichText({ props }: P) {
  const html = str(props.html)
  return (
    <section className="bg-background py-12">
      <div className={cn(CONTAINER, "max-w-3xl")}>
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
          <Field k="title">{str(props.title, "Notre mission")}</Field>
        </h2>
        <div
          className="prose prose-zinc mt-4 max-w-none"
          // Contenu du brouillon, assaini par le même nettoyage que l'affichage public.
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) || "<p class=\"text-muted-foreground\">Cliquez pour rédiger votre contenu…</p>" }}
        />
        <button type="button" data-tm-field="html" className="mt-3 text-xs font-semibold text-brand underline underline-offset-2">
          Modifier le contenu HTML
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 10. VIDEO
// ---------------------------------------------------------------------------
export function InlineVideo({ props }: P) {
  const url = str(props.url)
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)
  return (
    <section className="bg-background py-12">
      <div className={cn(CONTAINER, "max-w-4xl")}>
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
          <Field k="title">{str(props.title, "Notre histoire en vidéo")}</Field>
        </h2>
        <div className="mt-6 aspect-video overflow-hidden rounded-2xl bg-zinc-900">
          {match ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${match[1]}`}
              title="Aperçu vidéo"
              className="h-full w-full pointer-events-none"
              allowFullScreen
            />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-brand text-brand-foreground">
                <Play className="h-7 w-7 fill-brand-foreground" />
              </span>
            </div>
          )}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          <Field k="url">{url || "Cliquez pour définir l'URL YouTube"}</Field>
        </p>
        {str(props.description) && (
          <p className="mt-1 text-sm text-muted-foreground">
            <Field k="description">{str(props.description)}</Field>
          </p>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 11. COUNTDOWN
// ---------------------------------------------------------------------------
export function InlineCountdown({ props }: P) {
  const endsAt = str(props.endsAt)
  const label = endsAt ? new Date(endsAt).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" }) : "—"
  return (
    <section className="bg-zinc-900 py-12 text-center text-white">
      <div className={CONTAINER}>
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          <Field k="title">{str(props.title, "Vente flash")}</Field>
        </h2>
        <p className="mt-2 text-sm text-white/70">
          <Field k="text">{str(props.text, "Profitez-en avant la fin du compte à rebours !")}</Field>
        </p>
        <div className="mt-6 flex justify-center gap-3" style={{ opacity: endsAt ? 1 : 0.5 }}>
          {["00", "00", "00", "00"].map((v, i) => (
            <span key={i} className="rounded-xl bg-white/10 px-4 py-3 text-2xl font-extrabold tabular-nums">{v}</span>
          ))}
        </div>
        <p className="mt-2 text-xs text-white/50">Se termine le {label} — date modifiable via les réglages</p>
        {str(props.ctaLabel) && (
          <span className="mt-6 inline-flex rounded-lg bg-brand px-6 py-3 text-sm font-bold text-brand-foreground shadow-lg">
            <Field k="ctaLabel">{str(props.ctaLabel, "J'en profite")}</Field>
          </span>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 12. LOGOS
// ---------------------------------------------------------------------------
export function InlineLogos({ props }: P) {
  const items = recordList(props.items)
  return (
    <section className="border-y bg-card py-10">
      <div className={CONTAINER}>
        <h2 className="text-center text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <Field k="title">{str(props.title, "Ils nous accompagnent")}</Field>
        </h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-6">
          {(items.length ? items : [{ name: "Partenaire" }]).map((it, i) => (
            <span key={i} className="tm-item relative flex items-center">
              {str(it.image) ? (
                 
                <img src={str(it.image)} alt={str(it.name, "Logo")} className="h-10 object-contain" draggable={false} />
              ) : (
                <ItemField k={`items.${i}.name`} className="text-lg font-extrabold text-zinc-400">
                  {str(it.name, "Logo")}
                </ItemField>
              )}
              <ListControls list="items" index={i} />
            </span>
          ))}
        </div>
        <AddItem list="items" label="partenaire" />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 13. REVIEWS (données réelles en boutique)
// ---------------------------------------------------------------------------
export function InlineReviews({ props }: P) {
  const count = Math.max(1, Math.min(12, num(props.count, 6)))
  return (
    <section className="bg-background py-12">
      <div className={CONTAINER}>
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
          <Field k="title">{str(props.title, "Ce que disent nos clients")}</Field>
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
            <figure key={i} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-zinc-200" />
                <div>
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className="h-3.5 w-3.5 fill-amber-500 stroke-amber-500" />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Produit · il y a 2 j</p>
                </div>
                <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" />
              </div>
              <blockquote className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                « Produit conforme à la description, livraison ultra rapide. Je recommande ! »
              </blockquote>
            </figure>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">※ En boutique, cette grille affiche vos derniers avis approuvés.</p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 14. NEWSLETTER
// ---------------------------------------------------------------------------
export function InlineNewsletter({ props }: P) {
  return (
    <section className="bg-zinc-900 py-14 text-center text-white">
      <div className={cn(CONTAINER, "max-w-2xl")}>
        <h2 className="text-2xl font-extrabold tracking-tight">
          <Field k="title">{str(props.title, "Recevez nos offres en avant-première")}</Field>
        </h2>
        <p className="mt-2 text-sm text-white/70">
          <Field k="text">{str(props.text, "Une sélection d'offres et de nouveautés, une fois par semaine.")}</Field>
        </p>
        <div className="mx-auto mt-6 flex max-w-md gap-2">
          <span className="h-11 flex-1 rounded-lg border border-white/20 bg-white/10" />
          <span className="grid h-11 w-28 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
            <Field k="ctaLabel">{str(props.ctaLabel, "S'inscrire")}</Field>
          </span>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 15. SEO TEXT
// ---------------------------------------------------------------------------
export function InlineSeoText({ props }: P) {
  return (
    <section className="bg-background py-10">
      <div className={cn(CONTAINER, "max-w-4xl")}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <Field k="title">{str(props.title, "Téranga Market, votre marketplace de confiance")}</Field>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          <Field k="text">{str(props.text, "Bloc de texte utile au référencement naturel…")}</Field>
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// REGISTRE INLINE
// ---------------------------------------------------------------------------
export const INLINE_RENDERERS: Record<string, (p: P) => React.ReactElement> = {
  hero: InlineHero,
  "usp-bar": InlineUspBar,
  categories: InlineCategories,
  "product-grid": InlineProductGrid,
  "promo-banner": InlinePromoBanner,
  "collection-highlight": InlineCollectionHighlight,
  testimonials: InlineTestimonials,
  faq: InlineFaq,
  "rich-text": InlineRichText,
  video: InlineVideo,
  countdown: InlineCountdown,
  logos: InlineLogos,
  reviews: InlineReviews,
  newsletter: InlineNewsletter,
  "seo-text": InlineSeoText,
}
