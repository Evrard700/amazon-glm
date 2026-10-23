"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Trash2, Pencil, ExternalLink, Globe, LayoutTemplate, Search } from "lucide-react"
import { toast } from "sonner"
import { AdminPageHeader } from "@/components/admin/page-header"
import { useAdminApi } from "@/components/admin/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

interface PageRow {
  id: string
  slug: string
  title: string
  isPublished: boolean
  isSystem: boolean
  publishedAt: string | null
  updatedAt: string
  sectionCount: number
}

export default function AdminStorefrontPagesPage() {
  const api = useAdminApi()
  const [pages, setPages] = useState<PageRow[] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newPage, setNewPage] = useState({ title: "", slug: "" })

  async function load() {
    const data = await api.get<PageRow[]>("/api/admin/pages")
    if (data) setPages(data)
  }

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [api])

  function autoSlug(title: string) {
    return title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/[\s-]+/g, "-")
      .slice(0, 60)
  }

  async function createPage() {
    const slug = newPage.slug || autoSlug(newPage.title)
    if (!newPage.title || !slug) {
      toast.error("Titre requis (le slug est déduit automatiquement).")
      return
    }
    const data = await api.post<{ id: string }>("/api/admin/pages", { title: newPage.title, slug })
    if (data) {
      toast.success("Page créée — ajoutez vos sections dans l'éditeur.")
      setCreateOpen(false)
      setNewPage({ title: "", slug: "" })
      window.location.href = `/admin/storefront/editor/${data.id}`
    }
  }

  async function removePage(p: PageRow) {
    const data = await api.del(`/api/admin/pages/${p.id}`)
    if (data) {
      toast.success("Page supprimée.")
      void load()
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Pages & Éditeur visuel"
        description="Composez vos pages par glisser-déposer, sans code. Les changements publiés apparaissent immédiatement sur la boutique."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="bg-brand text-brand-foreground hover:brightness-95">
            <Plus className="h-4 w-4" /> Nouvelle page
          </Button>
        }
      />

      <div className="mb-4 flex items-start gap-3 rounded-xl border bg-brand-soft/60 p-4 text-sm">
        <LayoutTemplate className="mt-0.5 h-5 w-5 shrink-0 text-brand-foreground" />
        <p className="text-brand-foreground/90">
          <strong>Comment ça marche :</strong> ouvrez une page dans l'éditeur, ajoutez/réorganisez des sections (bannière, grilles
          produits, témoignages, compte à rebours…), modifiez leurs contenus, prévisualisez sur mobile et ordinateur, puis cliquez
          sur <em>Publier</em>. Chaque publication crée une version restaurable.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {!pages ? (
          <div className="divide-y">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4"><div className="h-10 w-full animate-pulse rounded bg-secondary" /></div>
            ))}
          </div>
        ) : (
          <ul className="divide-y">
            {pages.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="rounded-lg bg-brand-soft p-2 text-brand-foreground"><Globe className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{p.title}</p>
                    {p.isSystem && <Badge variant="secondary">Page d'accueil</Badge>}
                    {p.isPublished ? (
                      <Badge className="bg-emerald-100 text-emerald-800">Publiée</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-700">Brouillon non publié</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    /{p.slug === "home" ? "(accueil)" : `pages/${p.slug}`} · {p.sectionCount} section(s) ·{" "}
                    maj {new Date(p.updatedAt).toLocaleDateString("fr-FR", { dateStyle: "short" })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {p.isPublished && (
                    <Button variant="ghost" size="icon" asChild aria-label="Voir en ligne">
                      <a href={p.slug === "home" ? "/" : `/pages/${p.slug}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <Button variant="outline" className="h-9" asChild>
                    <Link href={`/admin/storefront/editor/${p.id}`}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Éditer
                    </Link>
                  </Button>
                  {!p.isSystem && (
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => removePage(p)} aria-label="Supprimer">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle page marketing</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="np-title">Titre de la page</Label>
              <Input
                id="np-title"
                value={newPage.title}
                onChange={(e) => setNewPage((p) => ({ ...p, title: e.target.value, slug: autoSlug(e.target.value) }))}
                placeholder="Ex : Offre spéciale Ramadan"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-slug">Slug (URL)</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">/pages/</span>
                <Input id="np-slug" value={newPage.slug} onChange={(e) => setNewPage((p) => ({ ...p, slug: autoSlug(e.target.value) }))} placeholder="offre-ramadan" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button onClick={createPage} className="bg-brand text-brand-foreground hover:brightness-95">Créer et éditer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
