"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  CircleDollarSign,
  FileUp,
  ImagePlus,
  Info,
  Loader2,
  Package,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { useAdminApi } from "@/components/admin/api-client"
import { MultiSelect, type MultiSelectOption } from "@/components/admin/shared/multi-select"
import { ChipsInput } from "@/components/admin/shared/chips-input"
import { useMe } from "@/components/admin/shared/use-me"
import { uploadImage as uploadImageFile, uploadDigital as uploadDigitalFileApi } from "@/lib/upload-client"
import { formatXOF } from "@/lib/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// ---------- Types ----------

export interface ProductVariantDraft {
  id?: string
  name: string
  options: Record<string, string>
  sku: string
  price: string
  stock: string
  isActive: boolean
}

export interface ProductFormData {
  id?: string
  name: string
  slug: string
  type: "PHYSICAL" | "DIGITAL" | "HYBRID"
  status: "DRAFT" | "ACTIVE" | "ARCHIVED"
  description: string
  shortDescription: string
  price: string
  salePrice: string
  sku: string
  stock: string
  trackInventory: boolean
  images: string[]
  tags: string[]
  attributes: { name: string; values: string[] }[]
  relatedIds: string[]
  categoryIds: string[]
  collectionIds: string[]
  requiresShipping: boolean
  weightGrams: string
  digitalFileName: string | null
  digitalFileUrl: string | null
  digitalDownloadLimit: string
  variants: ProductVariantDraft[]
  orderItemsCount?: number
  salesCount?: number
}

export function emptyProduct(): ProductFormData {
  return {
    name: "",
    slug: "",
    type: "PHYSICAL",
    status: "DRAFT",
    description: "",
    shortDescription: "",
    price: "0",
    salePrice: "",
    sku: "",
    stock: "0",
    trackInventory: true,
    images: [],
    tags: [],
    attributes: [],
    relatedIds: [],
    categoryIds: [],
    collectionIds: [],
    requiresShipping: true,
    weightGrams: "",
    digitalFileName: null,
    digitalFileUrl: null,
    digitalDownloadLimit: "5",
    variants: [],
  }
}

// ---------- Helpers ----------

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** "Taille:M,Couleur:Noir" → { Taille: "M", Couleur: "Noir" } */
function parseOptionsText(text: string): Record<string, string> | null {
  const options: Record<string, string> = {}
  for (const part of text.split(",")) {
    const [k, v] = part.split(":")
    if (!k?.trim() || !v?.trim()) return null
    options[k.trim()] = v.trim()
  }
  return Object.keys(options).length > 0 ? options : null
}

function optionsToName(options: Record<string, string>): string {
  return Object.entries(options)
    .map(([k, v]) => `${k} ${v}`)
    .join(" / ")
}

const TYPE_CARDS = [
  { value: "PHYSICAL", label: "Produit physique", desc: "Livraison requise, stock à suivre" },
  { value: "DIGITAL", label: "Produit numérique", desc: "Fichier téléchargeable, sans stock" },
  { value: "HYBRID", label: "Hybride", desc: "Colis + fichier numérique inclus" },
] as const

// ---------- Composant principal ----------

export function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter()
  const api = useAdminApi()
  const { me } = useMe()
  const isEdit = Boolean(productId)
  const canManage = me ? me.permissions.includes("products.manage") : false

  const [form, setForm] = useState<ProductFormData>(emptyProduct())
  const [slugTouched, setSlugTouched] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [keyPoints, setKeyPoints] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingDigital, setUploadingDigital] = useState(false)
  const [variantInput, setVariantInput] = useState<{ optionsText: string; name: string; sku: string; price: string; stock: string }>({
    optionsText: "",
    name: "",
    sku: "",
    price: "",
    stock: "0",
  })
  const [categories, setCategories] = useState<MultiSelectOption[]>([])
  const [collections, setCollections] = useState<MultiSelectOption[]>([])
  const [productOptions, setProductOptions] = useState<MultiSelectOption[]>([])
  const imageFileRef = useRef<HTMLInputElement>(null)
  const digitalFileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // Chargement initial : référentiels + produit si édition
  useEffect(() => {
    ;(async () => {
      const [cats, cols, prods] = await Promise.all([
        api.get<{ id: string; name: string; productsCount: number }[]>("/api/admin/categories"),
        api.get<{ id: string; name: string; productsCount: number }[]>("/api/admin/collections"),
        api.get<{ id: string; name: string; type: string }[]>("/api/admin/products?take=500"),
      ])
      if (cats) setCategories(cats.map((c) => ({ value: c.id, label: c.name, hint: `${c.productsCount} p.` })))
      if (cols) setCollections(cols.map((c) => ({ value: c.id, label: c.name, hint: `${c.productsCount} p.` })))
      if (prods) {
        setProductOptions(prods.map((p) => ({ value: p.id, label: p.name })))
      }
      if (productId) {
        const p = await api.get<ProductFormData>(`/api/admin/products/${productId}`)
        if (p) {
          setForm({
            ...p,
            name: p.name ?? "",
            slug: p.slug ?? "",
            description: p.description ?? "",
            shortDescription: p.shortDescription ?? "",
            sku: p.sku ?? "",
            price: String(p.price ?? "0"),
            salePrice: p.salePrice === null || p.salePrice === undefined ? "" : String(p.salePrice),
            stock: String(p.stock ?? "0"),
            weightGrams: p.weightGrams === null || p.weightGrams === undefined ? "" : String(p.weightGrams),
            digitalDownloadLimit: String(p.digitalDownloadLimit ?? "5"),
            variants: (p.variants ?? []).map((v) => ({
              id: v.id,
              name: v.name,
              options: v.options ?? {},
              sku: v.sku ?? "",
              price: v.price === null || v.price === undefined ? "" : String(v.price),
              stock: String(v.stock),
              isActive: v.isActive,
            })),
          })
          setSlugTouched(true)
        }
      }
      setLoading(false)
    })()
     
  }, [productId])

  // Slug automatique depuis le nom tant que l'utilisateur ne l'a pas édité
  function onNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }))
  }

  // Changement de type : cohérence livraison / stock
  function onTypeChange(type: ProductFormData["type"]) {
    setForm((f) => ({
      ...f,
      type,
      requiresShipping: type === "DIGITAL" ? false : true,
      trackInventory: type === "DIGITAL" ? false : f.trackInventory,
    }))
  }

  // ---------- IA ----------
  async function generateDescription() {
    if (form.name.trim().length < 2) {
      toast.error("Saisissez d'abord un nom de produit (2 caractères minimum).")
      return
    }
    setAiLoading(true)
    try {
      const res = await fetch("/api/admin/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, type: form.type, keyPoints: keyPoints || undefined }),
      })
      const json = (await res.json()) as { ok: boolean; data?: { shortDescription: string; description: string }; error?: string }
      if (!json.ok || !json.data) {
        toast.error(json.error ?? "La génération a échoué.")
        return
      }
      const { shortDescription, description } = json.data
      setForm((f) => ({ ...f, shortDescription, description }))
      toast.success("Description générée par l'IA. Relisez et ajustez avant d'enregistrer.")
    } catch {
      toast.error("Le générateur IA est momentanément indisponible.")
    } finally {
      setAiLoading(false)
    }
  }

  // ---------- Uploads ----------
  async function uploadImage(file: File) {
    setUploadingImage(true)
    try {
      const { url } = await uploadImageFile(file)
      setForm((f) => ({ ...f, images: [...f.images, url].slice(0, 10) }))
      toast.success("Image ajoutée.")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Échec de l'envoi de l'image.")
    } finally {
      setUploadingImage(false)
      if (imageFileRef.current) imageFileRef.current.value = ""
    }
  }

  async function uploadDigitalFile(file: File) {
    setUploadingDigital(true)
    try {
      const { fileName, displayName } = await uploadDigitalFileApi(file)
      setForm((f) => ({ ...f, digitalFileUrl: fileName, digitalFileName: displayName }))
      toast.success("Fichier numérique enregistré.")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Échec de l'envoi du fichier.")
    } finally {
      setUploadingDigital(false)
      if (digitalFileRef.current) digitalFileRef.current.value = ""
    }
  }

  // ---------- Variantes ----------
  function addVariant() {
    const options = variantInput.optionsText.trim() ? parseOptionsText(variantInput.optionsText) : null
    if (variantInput.optionsText.trim() && !options) {
      toast.error('Format des options invalide. Exemple : "Taille:M,Couleur:Noir".')
      return
    }
    const name = options ? optionsToName(options) : variantInput.name.trim()
    if (!name) {
      toast.error("Renseignez un nom de variante ou des options (ex : Taille:M,Couleur:Noir).")
      return
    }
    const price = variantInput.price.trim() === "" ? null : Math.round(Number(variantInput.price))
    if (price !== null && (Number.isNaN(price) || price < 0)) {
      toast.error("Prix de la variante invalide.")
      return
    }
    const stock = Math.round(Number(variantInput.stock))
    if (Number.isNaN(stock) || stock < 0) {
      toast.error("Stock de la variante invalide.")
      return
    }
    const autoSku =
      variantInput.sku.trim() ||
      `${slugify(form.name).slice(0, 20).toUpperCase()}-${slugify(name).slice(0, 10).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
    setForm((f) => ({
      ...f,
      variants: [
        ...f.variants,
        { name, options: options ?? {}, sku: autoSku, price: price === null ? "" : String(price), stock: String(stock), isActive: true },
      ],
    }))
    setVariantInput({ optionsText: "", name: "", sku: "", price: "", stock: "0" })
  }

  // ---------- Validation & enregistrement ----------
  function buildPayload() {
    const price = Math.round(Number(form.price))
    const salePrice = form.salePrice.trim() === "" ? null : Math.round(Number(form.salePrice))
    if (Number.isNaN(price) || price < 0) return { error: "Prix invalide." } as const
    if (salePrice !== null && (Number.isNaN(salePrice) || salePrice < 0)) return { error: "Prix promotionnel invalide." } as const
    if (salePrice !== null && salePrice >= price) return { error: "Le prix promotionnel doit être strictement inférieur au prix normal." } as const
    if (form.name.trim().length < 2) return { error: "Le nom doit contenir au moins 2 caractères." } as const
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) return { error: "Slug invalide : minuscules, chiffres et tirets uniquement." } as const
    if (form.description.trim().length === 0) return { error: "La description est obligatoire." } as const
    if (form.shortDescription.length > 300) return { error: "L'accroche ne doit pas dépasser 300 caractères." } as const
    const stock = Math.round(Number(form.stock))
    if (Number.isNaN(stock) || stock < 0) return { error: "Stock invalide." } as const
    const weightGrams = form.weightGrams.trim() === "" ? null : Math.round(Number(form.weightGrams))
    if (weightGrams !== null && (Number.isNaN(weightGrams) || weightGrams < 0)) return { error: "Poids invalide." } as const
    const downloadLimit = Math.round(Number(form.digitalDownloadLimit))
    if (Number.isNaN(downloadLimit) || downloadLimit < 0 || downloadLimit > 100) return { error: "Limite de téléchargements invalide (0 à 100)." } as const
    if ((form.type === "DIGITAL" || form.type === "HYBRID") && !form.digitalFileUrl) {
      return { error: "Importez le fichier numérique (requis pour un produit numérique ou hybride)." } as const
    }
    if (form.type === "PHYSICAL" && !form.requiresShipping) {
      return { error: "Un produit physique nécessite la livraison." } as const
    }

    return {
      data: {
        name: form.name.trim(),
        slug: form.slug,
        type: form.type,
        status: form.status,
        description: form.description,
        shortDescription: form.shortDescription.trim() === "" ? null : form.shortDescription,
        price,
        salePrice,
        sku: form.sku.trim() === "" ? null : form.sku.trim(),
        stock: form.type === "DIGITAL" ? 0 : stock,
        trackInventory: form.type === "DIGITAL" ? false : form.trackInventory,
        images: form.images,
        tags: form.tags,
        attributes: form.attributes.filter((a) => a.name.trim()),
        relatedIds: form.relatedIds.filter((r) => r !== productId),
        categoryIds: form.categoryIds,
        collectionIds: form.collectionIds,
        requiresShipping: form.type === "DIGITAL" ? false : form.requiresShipping,
        weightGrams,
        digitalFileName: form.type === "PHYSICAL" ? null : form.digitalFileName,
        digitalFileUrl: form.type === "PHYSICAL" ? null : form.digitalFileUrl,
        digitalDownloadLimit: downloadLimit,
        variants: form.variants.map((v, i) => {
          const price = v.price.trim() === "" ? null : Math.round(Number(v.price))
          return {
            id: v.id,
            name: v.name,
            options: v.options,
            sku: v.sku.trim() === "" ? null : v.sku.trim(),
            price: price !== null && !Number.isNaN(price) ? price : null,
            stock: Math.max(0, Math.round(Number(v.stock) || 0)),
            isActive: v.isActive,
            position: i,
          }
        }),
      },
    } as const
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = buildPayload()
    if ("error" in payload) {
      toast.error(payload.error)
      return
    }
    setSaving(true)
    const result = isEdit
      ? await api.put<{ id: string }>(`/api/admin/products/${productId}`, payload.data)
      : await api.post<{ id: string }>("/api/admin/products", payload.data)
    setSaving(false)
    if (result) {
      toast.success(isEdit ? "Produit mis à jour." : "Produit créé.")
      router.push(`/admin/products/${result.id}`)
      router.refresh()
    }
  }

  const price = Number(form.price) || 0
  const salePrice = form.salePrice.trim() === "" ? null : Number(form.salePrice)
  const digital = form.type === "DIGITAL" || form.type === "HYBRID"
  const displayPrice = salePrice !== null && salePrice < price ? salePrice : price

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-secondary" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="p-4 sm:p-6">
      <AdminPageHeader
        title={isEdit ? `Modifier « ${form.name} »` : "Nouveau produit"}
        description={
          isEdit
            ? "Toutes les modifications sont journalisées. Les prix sont toujours recalculés côté serveur."
            : "Créez un produit physique, numérique ou hybride. Brouillon tant qu'il n'est pas publié."
        }
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.push("/admin/products")}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving || (me !== null && !canManage)} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Enregistrer les modifications" : "Créer le produit"}
            </Button>
          </>
        }
      />

      {!canManage && me && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Info className="h-4 w-4 shrink-0" />
          Vous n'avez pas la permission « products.manage » : le formulaire est en lecture seule.
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {/* ============ Colonne gauche : contenu ============ */}
        <div className="space-y-4 lg:col-span-2">
          {/* Type */}
          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Type de produit</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {TYPE_CARDS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => onTypeChange(t.value)}
                    disabled={me !== null && !canManage}
                    className={cn(
                      "rounded-xl border-2 p-3 text-left transition",
                      form.type === t.value ? "border-brand bg-brand-soft" : "border-border hover:border-muted-foreground/40",
                    )}
                  >
                    <p className="text-sm font-semibold">{t.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t.desc}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Nom / slug / statut */}
          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informations générales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="product-name">Nom du produit *</Label>
                  <Input id="product-name" value={form.name} onChange={(e) => onNameChange(e.target.value)} placeholder="Ex : Thermomètre culinaire inox" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-slug">Slug (URL)</Label>
                  <div className="flex items-center gap-2">
                    <Input id="product-slug" value={form.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value) }} placeholder="thermometre-culinaire" />
                    {slugTouched && form.slug !== slugify(form.name) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 text-xs"
                        onClick={() => { setSlugTouched(false); set("slug", slugify(form.name)) }}
                      >
                        Régénérer
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Statut</Label>
                  <Select value={form.status} onValueChange={(v) => set("status", v as ProductFormData["status"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DRAFT">Brouillon (invisible en boutique)</SelectItem>
                      <SelectItem value="ACTIVE">Publié (visible)</SelectItem>
                      <SelectItem value="ARCHIVED">Archivé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-sku">SKU (référence interne)</Label>
                  <Input id="product-sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="TM-ELEC-001" />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="product-short">Accroche courte</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generateDescription}
                    disabled={aiLoading || (me !== null && !canManage)}
                    className="gap-1.5"
                  >
                    {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-brand" />}
                    {aiLoading ? "Génération en cours…" : "✨ Générer avec l'IA"}
                  </Button>
                </div>
                <Input
                  id="product-short"
                  value={form.shortDescription}
                  onChange={(e) => set("shortDescription", e.target.value)}
                  placeholder="1 phrase percutante affichée sur les listes"
                  maxLength={300}
                />
                <Input
                  value={keyPoints}
                  onChange={(e) => setKeyPoints(e.target.value)}
                  placeholder="Points clés pour l'IA (optionnel) : matière, usage, atouts…"
                  className="text-xs"
                  maxLength={400}
                />
                <Textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Description complète du produit…"
                  rows={8}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground">
                  L'IA propose un brouillon de texte — relisez, ajustez, et gardez uniquement ce qui est exact.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Prix */}
          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Prix &amp; stock</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="product-price">Prix normal (FCFA) *</Label>
                  <Input id="product-price" type="number" min={0} step={1} value={form.price} onChange={(e) => set("price", e.target.value)} />
                  {salePrice !== null && salePrice >= price && <p className="text-xs text-rose-600">Le prix promo doit être inférieur au prix normal.</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-sale">Prix promotionnel (FCFA)</Label>
                  <Input id="product-sale" type="number" min={0} step={1} value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} placeholder="Laisser vide si aucune promo" />
                </div>
              </div>
              {salePrice !== null && salePrice < price && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                  <CircleDollarSign className="h-3.5 w-3.5" /> Prix affiché en boutique : <strong>{formatXOF(salePrice)}</strong> au lieu de <s>{formatXOF(price)}</s>
                </p>
              )}

              {form.type !== "DIGITAL" && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="product-stock">Stock</Label>
                    <Input id="product-stock" type="number" min={0} step={1} value={form.stock} onChange={(e) => set("stock", e.target.value)} disabled={!form.trackInventory} />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch id="product-track" checked={form.trackInventory} onCheckedChange={(v) => set("trackInventory", v)} />
                    <Label htmlFor="product-track">Suivre le stock</Label>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="product-weight">Poids (grammes)</Label>
                    <Input id="product-weight" type="number" min={0} step={1} value={form.weightGrams} onChange={(e) => set("weightGrams", e.target.value)} placeholder="Ex : 350" />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch id="product-shipping" checked={form.requiresShipping} onCheckedChange={(v) => set("requiresShipping", v)} disabled={form.type === "DIGITAL"} />
                <Label htmlFor="product-shipping">
                  Nécessite une livraison {form.type === "DIGITAL" && <span className="text-xs text-muted-foreground">(désactivé pour un produit 100 % numérique)</span>}
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Images */}
          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Images ({form.images.length}/10)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-52 flex-1">
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Coller une URL d'image (https://…)"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        if (imageUrl.trim().length > 3) {
                          set("images", [...form.images, imageUrl.trim()].slice(0, 10))
                          setImageUrl("")
                        }
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (imageUrl.trim().length > 3) {
                      set("images", [...form.images, imageUrl.trim()].slice(0, 10))
                      setImageUrl("")
                    } else {
                      toast.error("URL d'image invalide.")
                    }
                  }}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Ajouter l'URL
                </Button>
                <Button type="button" variant="outline" onClick={() => imageFileRef.current?.click()} disabled={uploadingImage} className="gap-1.5">
                  {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  Importer un fichier
                </Button>
                <input
                  ref={imageFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadImage(f)
                  }}
                />
              </div>
              {form.images.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  Aucune image. La première image sera la vignette principale.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {form.images.map((img, i) => (
                    <li key={`${img}-${i}`} className="group relative overflow-hidden rounded-xl border bg-secondary">
                      { }
                      <img src={img} alt={`Image ${i + 1} du produit`} className="aspect-square w-full object-cover" loading="lazy" />
                      {i === 0 && <Badge className="absolute left-1.5 top-1.5">Principale</Badge>}
                      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-foreground/70 p-1 opacity-0 transition group-hover:opacity-100">
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-white" aria-label="Monter" disabled={i === 0} onClick={() => set("images", [...form.images.slice(0, i - 1), form.images[i], form.images[i - 1], ...form.images.slice(i + 1)])}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-white" aria-label="Descendre" disabled={i === form.images.length - 1} onClick={() => set("images", [...form.images.slice(0, i), form.images[i + 1], form.images[i], ...form.images.slice(i + 2)])}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-white" aria-label="Retirer" onClick={() => set("images", form.images.filter((_, j) => j !== i))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Fichier numérique */}
          {digital && (
            <Card className="rounded-xl border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Fichier numérique</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {form.digitalFileUrl ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-secondary/40 px-3 py-2.5">
                    <FileUp className="h-4 w-4 shrink-0 text-emerald-700" />
                    <span className="flex-1 truncate text-sm font-medium">{form.digitalFileName ?? form.digitalFileUrl}</span>
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Stocké</Badge>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Retirer le fichier" onClick={() => setForm((f) => ({ ...f, digitalFileUrl: null, digitalFileName: null }))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    Aucun fichier. Les acheteurs y accéderont après confirmation du paiement (token signé à durée limitée).
                  </p>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <Button type="button" variant="outline" onClick={() => digitalFileRef.current?.click()} disabled={uploadingDigital} className="gap-1.5">
                    {uploadingDigital ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                    {form.digitalFileUrl ? "Remplacer le fichier" : "Importer le fichier (max 50 Mo)"}
                  </Button>
                  <div className="space-y-1.5">
                    <Label htmlFor="product-download-limit">Téléchargements max / client</Label>
                    <Input
                      id="product-download-limit"
                      type="number"
                      min={0}
                      max={100}
                      className="w-36"
                      value={form.digitalDownloadLimit}
                      onChange={(e) => set("digitalDownloadLimit", e.target.value)}
                    />
                  </div>
                  <input
                    ref={digitalFileRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadDigitalFile(f)
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Variantes */}
          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="h-4 w-4" /> Variantes ({form.variants.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground">Ex : « Taille M », « Noir ». Le stock se gère alors par variante.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 rounded-lg border bg-secondary/30 p-3 sm:grid-cols-5">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Options « Taille:M,Couleur:Noir »</Label>
                  <Input
                    value={variantInput.optionsText}
                    onChange={(e) => setVariantInput((v) => ({ ...v, optionsText: e.target.value }))}
                    placeholder="Taille:M,Couleur:Noir"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ou nom libre</Label>
                  <Input
                    value={variantInput.name}
                    onChange={(e) => setVariantInput((v) => ({ ...v, name: e.target.value }))}
                    placeholder="Modèle A"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Prix (FCFA)</Label>
                  <Input
                    value={variantInput.price}
                    onChange={(e) => setVariantInput((v) => ({ ...v, price: e.target.value }))}
                    placeholder="Surcharge"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Stock</Label>
                  <Input
                    value={variantInput.stock}
                    onChange={(e) => setVariantInput((v) => ({ ...v, stock: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <Button type="button" onClick={addVariant} variant="outline" className="h-8 gap-1 text-xs sm:col-span-5 sm:w-fit">
                  <Plus className="h-3.5 w-3.5" /> Ajouter la variante
                </Button>
              </div>

              {form.variants.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune variante — le stock se gère directement sur le produit.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {form.variants.map((v, i) => (
                    <li key={v.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{v.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {v.sku}
                          {v.price && ` · ${formatXOF(Number(v.price))}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Label className="sr-only" htmlFor={`variant-stock-${i}`}>Stock</Label>
                        <Input
                          id={`variant-stock-${i}`}
                          type="number"
                          min={0}
                          className="h-8 w-20 text-xs"
                          value={v.stock}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              variants: f.variants.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x)),
                            }))
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant={v.isActive ? "secondary" : "outline"}
                          className="h-8 text-xs"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              variants: f.variants.map((x, j) => (j === i ? { ...x, isActive: !x.isActive } : x)),
                            }))
                          }
                        >
                          {v.isActive ? "Active" : "Inactive"}
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-rose-600"
                          aria-label={`Supprimer la variante ${v.name}`}
                          onClick={() => setForm((f) => ({ ...f, variants: f.variants.filter((_, j) => j !== i) }))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ============ Colonne droite : organisation ============ */}
        <div className="space-y-4">
          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Catégories</CardTitle>
            </CardHeader>
            <CardContent>
              <MultiSelect options={categories} value={form.categoryIds} onChange={(v) => set("categoryIds", v)} placeholder="Choisir des catégories…" />
            </CardContent>
          </Card>

          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Collections</CardTitle>
            </CardHeader>
            <CardContent>
              <MultiSelect options={collections} value={form.collectionIds} onChange={(v) => set("collectionIds", v)} placeholder="Choisir des collections…" />
            </CardContent>
          </Card>

          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Étiquettes (tags)</CardTitle>
            </CardHeader>
            <CardContent>
              <ChipsInput value={form.tags} onChange={(v) => set("tags", v)} placeholder="Ex : promo, nouveauté…" />
            </CardContent>
          </Card>

          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Attributs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {form.attributes.map((attr, i) => (
                <div key={i} className="space-y-1.5 rounded-lg border p-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={attr.name}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          attributes: f.attributes.map((a, j) => (j === i ? { ...a, name: e.target.value } : a)),
                        }))
                      }
                      placeholder="Nom (ex : Matière)"
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 text-rose-600"
                      aria-label="Retirer l'attribut"
                      onClick={() => setForm((f) => ({ ...f, attributes: f.attributes.filter((_, j) => j !== i) }))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <ChipsInput
                    value={attr.values}
                    onChange={(values) =>
                      setForm((f) => ({
                        ...f,
                        attributes: f.attributes.map((a, j) => (j === i ? { ...a, values } : a)),
                      }))
                    }
                    placeholder="Valeurs (Entrée pour ajouter)"
                    className="text-xs"
                  />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setForm((f) => ({ ...f, attributes: [...f.attributes, { name: "", values: [] }] }))}>
                <Plus className="h-3.5 w-3.5" /> Ajouter un attribut
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Produits recommandés</CardTitle>
              <p className="text-xs text-muted-foreground">Affichés comme suggestions sur la fiche produit.</p>
            </CardHeader>
            <CardContent>
              <MultiSelect options={productOptions.filter((o) => o.value !== productId)} value={form.relatedIds} onChange={(v) => set("relatedIds", v)} placeholder="Choisir des produits…" />
            </CardContent>
          </Card>

          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" /> Résumé
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p className="flex justify-between gap-2">
                <span className="text-muted-foreground">Prix affiché</span>
                <strong>{formatXOF(displayPrice)}</strong>
              </p>
              {isEdit && (
                <>
                  <p className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Ventes</span>
                    <span>{form.salesCount ?? 0}</span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Lignes de commande</span>
                    <span>{form.orderItemsCount ?? 0}</span>
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
