"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ChevronRight, ImagePlus, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { useAdminApi } from "@/components/admin/api-client"
import { useMe } from "@/components/admin/shared/use-me"
import { uploadImage as uploadImageFile } from "@/lib/upload-client"
import { slugifyFr } from "@/components/admin/shared/slugify"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  imageUrl: string | null
  parentId: string | null
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
  parentId: string
  position: string
  isActive: boolean
}

const EMPTY: FormState = { name: "", slug: "", description: "", imageUrl: "", parentId: "none", position: "0", isActive: true }

export default function AdminCategoriesPage() {
  const api = useAdminApi()
  const { me } = useMe()
  const canManage = me ? me.permissions.includes("products.manage") : true

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await api.get<Category[]>("/api/admin/categories")
    if (data) setCategories(data)
    setLoading(false)
     
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Arbre parent → enfants
  const tree = useMemo(() => {
    const roots = categories.filter((c) => !c.parentId)
    return roots.map((root) => ({ ...root, children: categories.filter((c) => c.parentId === root.id) }))
  }, [categories])

  function openCreate(parent?: Category) {
    setForm({ ...EMPTY, parentId: parent?.id ?? "none" })
    setSlugTouched(false)
    setOpen(true)
  }

  function openEdit(c: Category) {
    setForm({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description ?? "",
      imageUrl: c.imageUrl ?? "",
      parentId: c.parentId ?? "none",
      position: String(c.position),
      isActive: c.isActive,
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
      toast.error("Nom trop court (2 caractères minimum).")
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      slug: form.slug,
      description: form.description.trim() === "" ? null : form.description,
      imageUrl: form.imageUrl.trim() === "" ? null : form.imageUrl,
      parentId: form.parentId === "none" ? null : form.parentId,
      position: Math.round(Number(form.position) || 0),
      isActive: form.isActive,
    }
    const result = form.id
      ? await api.patch<{ id: string }>(`/api/admin/categories/${form.id}`, payload)
      : await api.post<{ id: string }>("/api/admin/categories", payload)
    setSaving(false)
    if (result) {
      toast.success(form.id ? "Catégorie mise à jour." : "Catégorie créée.")
      setOpen(false)
      load()
    }
  }

  async function onDelete() {
    if (!deleteTarget) return
    const result = await api.del<{ id: string }>(`/api/admin/categories/${deleteTarget.id}`)
    if (result !== null) {
      toast.success("Catégorie supprimée.")
      setDeleteTarget(null)
      load()
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <AdminPageHeader
        title="Catégories"
        description="Organisez votre catalogue en catégories hiérarchiques (parent + sous-catégories)."
        actions={
          canManage && (
            <Button onClick={() => openCreate()} className="gap-1.5">
              <Plus className="h-4 w-4" /> Nouvelle catégorie
            </Button>
          )
        }
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : tree.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Aucune catégorie. Créez la première pour organiser vos produits.
        </p>
      ) : (
        <div className="max-h-[70vh] space-y-2 overflow-y-auto scrollbar-thin pr-1">
          {tree.map((root) => (
            <div key={root.id} className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-center gap-3 p-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-secondary">
                  {root.imageUrl ? (
                     
                    <img src={root.imageUrl} alt={root.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-brand-soft" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {root.name} {!root.isActive && <Badge variant="outline" className="ml-1 border bg-neutral-100 text-neutral-600 border-neutral-200">Inactive</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    /{root.slug} · {root.productsCount} produit(s)
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => openCreate(root)}>
                      <Plus className="h-3.5 w-3.5" /> Sous-catégorie
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Modifier ${root.name}`} onClick={() => openEdit(root)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600" aria-label={`Supprimer ${root.name}`} onClick={() => setDeleteTarget(root)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              {root.children.length > 0 && (
                <ul className="divide-y border-t">
                  {root.children.map((child) => (
                    <li key={child.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 pl-8">
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          {child.name} {!child.isActive && <Badge variant="outline" className="ml-1 border bg-neutral-100 text-neutral-600 border-neutral-200">Inactive</Badge>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">/{child.slug} · {child.productsCount} produit(s)</p>
                      </div>
                      {canManage && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Modifier ${child.name}`} onClick={() => openEdit(child)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" aria-label={`Supprimer ${child.name}`} onClick={() => setDeleteTarget(child)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dialog formulaire */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Modifier la catégorie" : "Nouvelle catégorie"}</DialogTitle>
            <DialogDescription>Le slug sert d'URL : minuscules, chiffres et tirets.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Nom *</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugifyFr(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-slug">Slug</Label>
              <Input id="cat-slug" value={form.slug} onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value })) }} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Catégorie parente</Label>
                <Select value={form.parentId} onValueChange={(v) => setForm((f) => ({ ...f, parentId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune (racine)</SelectItem>
                    {categories
                      .filter((c) => c.id !== form.id)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.parentId ? `— ${c.name}` : c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-position">Position (ordre d'affichage)</Label>
                <Input id="cat-position" type="number" min={0} value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea id="cat-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-image">Image (URL ou import)</Label>
              <div className="flex gap-2">
                <Input id="cat-image" value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" />
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
              {form.imageUrl && (
                 
                <img src={form.imageUrl} alt="Aperçu" className="mt-1 h-16 w-16 rounded-lg border object-cover" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch id="cat-active" checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
              <Label htmlFor="cat-active">Visible en boutique</Label>
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

      {/* Confirmation suppression */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleteTarget?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              La suppression sera refusée si des produits ou des sous-catégories y sont rattachés — vous devrez les retirer d'abord.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-700" onClick={onDelete}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
