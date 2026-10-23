"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ImagePlus, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { useAdminApi } from "@/components/admin/api-client"
import { useMe } from "@/components/admin/shared/use-me"
import { uploadImage as uploadImageFile } from "@/lib/upload-client"
import { MultiSelect, type MultiSelectOption } from "@/components/admin/shared/multi-select"
import { slugifyFr } from "@/components/admin/shared/slugify"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface Collection {
  id: string
  name: string
  slug: string
  description: string | null
  imageUrl: string | null
  isFeatured: boolean
  position: number
  isActive: boolean
  productsCount: number
}

interface FormState {
  id?: string
  name: string
  slug: string
  description: string
  imageUrl: string
  isFeatured: boolean
  position: string
  isActive: boolean
  productIds: string[]
}

const EMPTY: FormState = { name: "", slug: "", description: "", imageUrl: "", isFeatured: false, position: "0", isActive: true, productIds: [] }

export default function AdminCollectionsPage() {
  const api = useAdminApi()
  const { me } = useMe()
  const canManage = me ? me.permissions.includes("products.manage") : true

  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [productOptions, setProductOptions] = useState<MultiSelectOption[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [cols, prods] = await Promise.all([
      api.get<Collection[]>("/api/admin/collections"),
      api.get<{ id: string; name: string }[]>("/api/admin/products?take=500"),
    ])
    if (cols) setCollections(cols)
    if (prods) setProductOptions(prods.map((p) => ({ value: p.id, label: p.name })))
    setLoading(false)
     
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setForm(EMPTY)
    setSlugTouched(false)
    setOpen(true)
  }

  async function openEdit(c: Collection) {
    const detail = await api.get<FormState>(`/api/admin/collections/${c.id}`)
    if (!detail) return
    setForm({
      id: detail.id,
      name: detail.name,
      slug: detail.slug,
      description: detail.description ?? "",
      imageUrl: detail.imageUrl ?? "",
      isFeatured: detail.isFeatured,
      position: String(detail.position),
      isActive: detail.isActive,
      productIds: detail.productIds,
    })
    setSlugTouched(true)
    setOpen(true)
  }

  async function uploadImage(file: File) {
    setUploading(true)
    try {
      const { url } = await uploadImageFile(file)
      setForm((f) => ({ ...f, imageUrl: url }))
      toast.success("Image importée.")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Échec de l'envoi.")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function onSave() {
    if (form.name.trim().length < 2) {
      toast.error("Nom trop court.")
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      slug: form.slug,
      description: form.description.trim() === "" ? null : form.description,
      imageUrl: form.imageUrl.trim() === "" ? null : form.imageUrl,
      isFeatured: form.isFeatured,
      position: Math.round(Number(form.position) || 0),
      isActive: form.isActive,
      productIds: form.productIds,
    }
    const result = form.id
      ? await api.patch<{ id: string }>(`/api/admin/collections/${form.id}`, payload)
      : await api.post<{ id: string }>("/api/admin/collections", payload)
    setSaving(false)
    if (result) {
      toast.success(form.id ? "Collection mise à jour." : "Collection créée.")
      setOpen(false)
      load()
    }
  }

  async function onDelete(c: Collection) {
    const result = await api.del<{ id: string }>(`/api/admin/collections/${c.id}`)
    if (result !== null) {
      toast.success("Collection supprimée.")
      load()
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <AdminPageHeader
        title="Collections"
        description="Regroupements thématiques mis en avant en boutique (sélections saisonnières, coups de cœur…)."
        actions={
          canManage && (
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> Nouvelle collection
            </Button>
          )
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Aucune collection. Créez la première pour mettre en avant vos produits.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <div key={c.id} className="flex flex-col rounded-xl border bg-card">
              <div className="relative h-28 overflow-hidden rounded-t-xl bg-brand-soft">
                {c.imageUrl ? (
                   
                  <img src={c.imageUrl} alt={c.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sans image</div>
                )}
                {c.isFeatured && (
                  <Badge className="absolute left-2 top-2 gap-1">
                    <Star className="h-3 w-3" /> En vedette
                  </Badge>
                )}
                {!c.isActive && <Badge variant="outline" className="absolute right-2 top-2 border bg-neutral-100 text-neutral-600 border-neutral-200">Inactive</Badge>}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground">/{c.slug} · {c.productsCount} produit(s)</p>
                {c.description && <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>}
                {canManage && (
                  <div className="mt-auto flex gap-1.5 pt-2">
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" /> Modifier
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" aria-label={`Supprimer ${c.name}`} onClick={() => onDelete(c)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Modifier la collection" : "Nouvelle collection"}</DialogTitle>
            <DialogDescription>Sélectionnez les produits qui composent la collection.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="col-name">Nom *</Label>
              <Input
                id="col-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugifyFr(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="col-slug">Slug</Label>
              <Input id="col-slug" value={form.slug} onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value })) }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="col-desc">Description</Label>
              <Textarea id="col-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="col-image">Image</Label>
              <div className="flex gap-2">
                <Input id="col-image" value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" />
                <Button type="button" variant="outline" size="icon" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Importer une image">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadImage(f)
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Produits de la collection ({form.productIds.length})</Label>
              <MultiSelect options={productOptions} value={form.productIds} onChange={(v) => setForm((f) => ({ ...f, productIds: v }))} placeholder="Choisir des produits…" />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch id="col-featured" checked={form.isFeatured} onCheckedChange={(v) => setForm((f) => ({ ...f, isFeatured: v }))} />
                <Label htmlFor="col-featured">En vedette</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="col-active" checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
                <Label htmlFor="col-active">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="col-position" className="text-sm">Position</Label>
                <Input id="col-position" type="number" min={0} className="h-8 w-20" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={onSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {form.id ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
