// ============================================================================
// DÉFINITIONS DES SECTIONS — module SERVEUR-SAFE (aucun "use client", aucun
// composant React). Consommé par l'API de validation des pages ET par le
// registre client (registry.tsx) qui y attache les aperçus.
// ============================================================================

export type PageSectionData = {
  id: string
  type: string
  props: Record<string, unknown>
  hidden?: boolean
}

/** Option de liste déroulante. */
export interface FieldOption {
  value: string
  label: string
}

/** Champs scalaires du formulaire de réglages généré par l'éditeur. */
export type SectionField =
  | {
      key: string
      label: string
      type: "text" | "textarea" | "number" | "range" | "switch" | "image" | "color" | "select" | "date" | "richtext" | "icon"
      placeholder?: string
      help?: string
      min?: number
      max?: number
      step?: number
      options?: FieldOption[]
    }
  | {
      key: string
      label: string
      type: "list"
      itemLabel?: string
      itemFields: SectionItemField[]
    }
  | {
      key: string
      label: string
      type: "product-picker" | "collection-picker" | "category-picker" | "page-picker"
      multiple?: boolean
      help?: string
    }

/** Champs d'un élément de liste. */
export interface SectionItemField {
  key: string
  label: string
  type: "text" | "textarea" | "number" | "icon" | "image" | "select"
  placeholder?: string
  min?: number
  max?: number
  options?: FieldOption[]
}

/** Définition complète d'un type de section (serveur-safe, sans composant). */
export interface SectionTypeDef {
  type: string
  label: string
  /** Nom d'icône lucide-react (kebab-case), ex: "shopping-bag". */
  icon?: string
  description?: string
  /** Props par défaut à l'ajout d'une section de ce type. */
  defaults: Record<string, unknown>
  /** Formulaire de réglages généré dynamiquement par l'éditeur. */
  fields: SectionField[]
}

// ---------- Options partagées ----------

const USP_ICON_OPTIONS: FieldOption[] = [
  { value: "truck", label: "Camion (livraison)" },
  { value: "shield", label: "Bouclier (sécurité)" },
  { value: "refresh", label: "Flèches (retours)" },
  { value: "headset", label: "Casque (support)" },
  { value: "gift", label: "Cadeau (offert)" },
  { value: "percent", label: "Pourcentage (promo)" },
  { value: "star", label: "Étoile (qualité)" },
]

const PRODUCT_SOURCE_OPTIONS: FieldOption[] = [
  { value: "featured", label: "Coups de cœur (mis en avant)" },
  { value: "new", label: "Nouveautés (plus récents)" },
  { value: "sale", label: "En promotion" },
  { value: "collection", label: "Depuis une collection" },
]


// ---------- Les 15 types supportés ----------

export const SECTION_DEFS: Omit<SectionTypeDef, "preview">[] = [
  {
    type: "hero",
    label: "Bannière (héro)",
    icon: "image",
    description: "Grande bannière d'accueil avec titre, sous-titre, visuel et deux boutons d'appel à l'action.",
    defaults: {
      title: "Le meilleur du shopping, livré chez vous.",
      subtitle: "Électronique, mode, maison et produits numériques — paiement à la livraison possible.",
      ctaLabel: "Découvrir le catalogue",
      ctaHref: "/catalogue",
      ctaLabel2: "",
      ctaHref2: "",
      image: "",
      align: "left",
      overlay: 55,
    },
    fields: [
      { key: "title", label: "Titre", type: "text", placeholder: "Le meilleur du shopping…" },
      { key: "subtitle", label: "Sous-titre", type: "textarea", placeholder: "Une phrase accrocheuse" },
      { key: "ctaLabel", label: "Bouton principal — libellé", type: "text", placeholder: "Découvrir le catalogue" },
      { key: "ctaHref", label: "Bouton principal — lien", type: "text", placeholder: "/catalogue" },
      { key: "ctaLabel2", label: "Bouton secondaire — libellé", type: "text", placeholder: "(optionnel)" },
      { key: "ctaHref2", label: "Bouton secondaire — lien", type: "text", placeholder: "/account/referrals" },
      { key: "image", label: "Image de fond (URL)", type: "image", placeholder: "https://…" },
      {
        key: "align",
        label: "Alignement du texte",
        type: "select",
        options: [
          { value: "left", label: "À gauche" },
          { value: "center", label: "Centré" },
        ],
      },
      { key: "overlay", label: "Voile sombre (opacité %)", type: "range", min: 0, max: 90, step: 5, help: "Assure la lisibilité du texte sur l'image." },
    ],
  },
  {
    type: "usp-bar",
    label: "Barre d'avantages",
    icon: "list-checks",
    description: "Rangée d'icônes + arguments rassurants (livraison, paiement, retours…).",
    defaults: {
      items: [
        { icon: "truck", title: "Livraison rapide", text: "24–72 h à Abidjan" },
        { icon: "shield", title: "Paiement flexible", text: "À la livraison ou en ligne" },
        { icon: "refresh", title: "Retours faciles", text: "7 jours pour changer d'avis" },
        { icon: "headset", title: "Support 7j/7", text: "WhatsApp & téléphone" },
      ],
    },
    fields: [
      {
        key: "items",
        label: "Avantages",
        type: "list",
        itemLabel: "Avantage",
        itemFields: [
          { key: "icon", label: "Icône", type: "icon", options: USP_ICON_OPTIONS },
          { key: "title", label: "Titre", type: "text" },
          { key: "text", label: "Texte", type: "text" },
        ],
      },
    ],
  },
  {
    type: "categories",
    label: "Grille de catégories",
    icon: "layout-grid",
    description: "Vitrine des catégories actives de la boutique (données réelles, avec images).",
    defaults: { title: "Explorez par catégorie", count: 6 },
    fields: [
      { key: "title", label: "Titre", type: "text", placeholder: "Explorez par catégorie" },
      { key: "count", label: "Nombre de catégories", type: "number", min: 1, max: 12 },
    ],
  },
  {
    type: "product-grid",
    label: "Grille de produits",
    icon: "shopping-bag",
    description: "Produits réels selon une source : coups de cœur, nouveautés, promos ou collection.",
    defaults: { title: "Coups de cœur de la semaine", source: "featured", collectionSlug: "", count: 8, columns: 4 },
    fields: [
      { key: "title", label: "Titre", type: "text", placeholder: "Coups de cœur de la semaine" },
      { key: "source", label: "Source des produits", type: "select", options: PRODUCT_SOURCE_OPTIONS },
      { key: "collectionSlug", label: "Collection (si source = collection)", type: "collection-picker", help: "Ignoré pour les autres sources." },
      { key: "count", label: "Nombre de produits", type: "number", min: 1, max: 12 },
      { key: "columns", label: "Colonnes (desktop)", type: "range", min: 2, max: 4, step: 1 },
    ],
  },
  {
    type: "promo-banner",
    label: "Bandeau promotionnel",
    icon: "megaphone",
    description: "Bandeau coloré (couleurs personnalisables) avec message et bouton.",
    defaults: {
      title: "Promo Tech : jusqu'à -15 % sur une sélection",
      text: "Offre limitée cette semaine.",
      ctaLabel: "En profiter",
      ctaHref: "/catalogue?filter=promo",
      background: "#f59e0b",
      textColor: "#18181b",
      image: "",
    },
    fields: [
      { key: "title", label: "Titre", type: "text" },
      { key: "text", label: "Texte", type: "textarea" },
      { key: "ctaLabel", label: "Bouton — libellé", type: "text" },
      { key: "ctaHref", label: "Bouton — lien", type: "text", placeholder: "/catalogue?filter=promo" },
      { key: "background", label: "Couleur de fond", type: "color" },
      { key: "textColor", label: "Couleur du texte", type: "color" },
      { key: "image", label: "Image décorative (URL, option)", type: "image" },
    ],
  },
  {
    type: "collection-highlight",
    label: "Collection en vedette",
    icon: "bookmark",
    description: "Mise en avant d'une collection réelle : visuel, description et bouton vers le catalogue filtré.",
    defaults: {
      title: "Ressources numériques, disponibilité immédiate",
      collectionSlug: "",
      text: "Une sélection pensée pour vous.",
      ctaLabel: "Voir la collection",
      image: "",
    },
    fields: [
      { key: "title", label: "Titre", type: "text" },
      { key: "collectionSlug", label: "Collection", type: "collection-picker" },
      { key: "text", label: "Texte", type: "textarea", help: "Si vide, la description de la collection est utilisée." },
      { key: "ctaLabel", label: "Bouton — libellé", type: "text", placeholder: "Voir la collection" },
      { key: "image", label: "Image (URL, option — sinon image de la collection)", type: "image" },
    ],
  },
  {
    type: "testimonials",
    label: "Témoignages",
    icon: "quote",
    description: "Cartes de témoignages rédigés manuellement (nom, ville, note).",
    defaults: {
      title: "Ils nous font confiance",
      items: [
        { name: "Mariam K.", city: "Cocody", text: "Commande passée le matin, livrée le soir !", rating: 5 },
        { name: "Serge O.", city: "Yopougon", text: "Service impeccable, je recommande vivement.", rating: 5 },
        { name: "Adjoa T.", city: "Bouaké", text: "Des produits de qualité, livrés jusque chez moi.", rating: 4 },
      ],
    },
    fields: [
      { key: "title", label: "Titre", type: "text" },
      {
        key: "items",
        label: "Témoignages",
        type: "list",
        itemLabel: "Témoignage",
        itemFields: [
          { key: "name", label: "Nom", type: "text" },
          { key: "city", label: "Ville", type: "text" },
          { key: "text", label: "Témoignage", type: "textarea" },
          { key: "rating", label: "Note (1 à 5)", type: "number", min: 1, max: 5 },
        ],
      },
    ],
  },
  {
    type: "faq",
    label: "FAQ (accordéon)",
    icon: "help-circle",
    description: "Liste de questions/réponses dépliables.",
    defaults: {
      title: "Questions fréquentes",
      items: [
        { q: "Puis-je payer à la livraison ?", a: "Oui ! Le paiement à la livraison est disponible dans toutes nos zones." },
        { q: "Quels sont les délais de livraison ?", a: "24 à 72 h à Abidjan selon la zone, 2 à 5 jours pour l'intérieur du pays." },
      ],
    },
    fields: [
      { key: "title", label: "Titre", type: "text" },
      {
        key: "items",
        label: "Questions",
        type: "list",
        itemLabel: "Question",
        itemFields: [
          { key: "q", label: "Question", type: "text" },
          { key: "a", label: "Réponse", type: "textarea" },
        ],
      },
    ],
  },
  {
    type: "rich-text",
    label: "Texte enrichi (HTML)",
    icon: "file-text",
    description: "Bloc HTML libre (les scripts et attributs d'événements sont retirés à l'affichage).",
    defaults: {
      title: "Notre mission",
      html: "<p>Rédigez ici votre contenu enrichi : <strong>gras</strong>, <em>italique</em>, listes…</p>",
    },
    fields: [
      { key: "title", label: "Titre", type: "text" },
      { key: "html", label: "Contenu HTML", type: "richtext", placeholder: "<p>…</p>" },
    ],
  },
  {
    type: "video",
    label: "Vidéo YouTube",
    icon: "youtube",
    description: "Lecteur YouTube responsive (watch, youtu.be, shorts ou embed).",
    defaults: { title: "Notre histoire en vidéo", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", description: "" },
    fields: [
      { key: "title", label: "Titre", type: "text" },
      { key: "url", label: "URL YouTube", type: "text", placeholder: "https://www.youtube.com/watch?v=…" },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  {
    type: "countdown",
    label: "Compte à rebours",
    icon: "timer",
    description: "Offre limitée dans le temps avec décompte en direct (jours, heures, minutes, secondes).",
    defaults: {
      title: "Vente flash : -15 % sur la sélection tech",
      text: "Profitez-en avant la fin du compte à rebours !",
      endsAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString().slice(0, 16),
      ctaLabel: "J'en profite",
      ctaHref: "/catalogue?filter=promo",
    },
    fields: [
      { key: "title", label: "Titre", type: "text" },
      { key: "text", label: "Texte", type: "textarea" },
      { key: "endsAt", label: "Date de fin", type: "date" },
      { key: "ctaLabel", label: "Bouton — libellé", type: "text" },
      { key: "ctaHref", label: "Bouton — lien", type: "text" },
    ],
  },
  {
    type: "logos",
    label: "Logos partenaires",
    icon: "award",
    description: "Rangée de partenaires (nom ou logo).",
    defaults: {
      title: "Ils nous accompagnent",
      items: [{ name: "Made in CI" }, { name: "CCIA Abidjan" }, { name: "Wave" }, { name: "Orange Money" }],
    },
    fields: [
      { key: "title", label: "Titre", type: "text" },
      {
        key: "items",
        label: "Partenaires",
        type: "list",
        itemLabel: "Partenaire",
        itemFields: [
          { key: "name", label: "Nom", type: "text" },
          { key: "image", label: "Logo (URL, option)", type: "image" },
        ],
      },
    ],
  },
  {
    type: "reviews",
    label: "Avis clients récents",
    icon: "star",
    description: "Derniers avis APPROUVÉS de la boutique (données réelles, badge achat vérifié).",
    defaults: { title: "Ce que disent nos clients", count: 6 },
    fields: [
      { key: "title", label: "Titre", type: "text" },
      { key: "count", label: "Nombre d'avis", type: "number", min: 1, max: 12 },
    ],
  },
  {
    type: "newsletter",
    label: "Inscription newsletter",
    icon: "mail",
    description: "Formulaire d'inscription à la newsletter (POST /api/newsletter, enregistrement réel).",
    defaults: {
      title: "Recevez nos offres en avant-première",
      text: "Une sélection d'offres et de nouveautés, une fois par semaine. Sans spam.",
      ctaLabel: "S'inscrire",
    },
    fields: [
      { key: "title", label: "Titre", type: "text" },
      { key: "text", label: "Texte", type: "textarea" },
      { key: "ctaLabel", label: "Bouton — libellé", type: "text", placeholder: "S'inscrire" },
    ],
  },
  {
    type: "seo-text",
    label: "Texte SEO",
    icon: "search",
    description: "Bloc de texte discret en bas de page, utile pour le référencement naturel.",
    defaults: {
      title: "Téranga Market, votre marketplace de confiance",
      text: "Achetez en ligne au Sénégal et en Côte d'Ivoire : électronique, mode, maison, beauté et produits numériques. Paiement à la livraison, livraison rapide, retours faciles et programme de parrainage payant.",
    },
    fields: [
      { key: "title", label: "Titre (peut rester vide)", type: "text" },
      { key: "text", label: "Texte", type: "textarea" },
    ],
  },
]

/** Props par défaut d'un type de section (copie neuve à chaque appel). */
export function sectionDefaultProps(type: string): Record<string, unknown> {
  const def = SECTION_DEFS.find((s) => s.type === type)
  if (!def) return {}
  return JSON.parse(JSON.stringify(def.defaults)) as Record<string, unknown>
}

/** Métadonnées d'un type (pratique pour l'éditeur). */
export function sectionTypeDef(type: string): SectionTypeDef | undefined {
  return SECTION_DEFS.find((s) => s.type === type)
}
