"use client"

import { useEffect, useState } from "react"
import { Save, Loader2, Palette, Upload, Megaphone } from "lucide-react"
import { toast } from "sonner"
import { AdminPageHeader } from "@/components/admin/page-header"
import { useAdminApi } from "@/components/admin/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Logo } from "@/components/storefront/logo"
import { uploadImage as uploadImageFile } from "@/lib/upload-client"
import { formatXOF } from "@/lib/money"

interface ThemeData {
  logoUrl: string | null
  primaryColor: string
  accentColor: string
  radius: number
  announcementText: string | null
  announcementActive: boolean
  tagline: string
  footerAbout: string | null
  storeName: string
}

const PRESETS = [
  { name: "Téranga (défaut)", primary: "#18181b", accent: "#f59e0b" },
  { name: "Cacao profond", primary: "#291711", accent: "#d97706" },
  { name: "Forêt", primary: "#14211b", accent: "#65a30d" },
  { name: "Argile", primary: "#27211d", accent: "#ea580c" },
  { name: "Nuit dorée", primary: "#1c1917", accent: "#eab308" },
]

export default function AdminThemePage() {
  const api = useAdminApi()
  const [theme, setTheme] = useState<ThemeData | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(async () => {
      const data = await api.get<ThemeData>("/api/admin/theme")
      if (data) setTheme(data)
    }, 0)
    return () => clearTimeout(t)
  }, [api])

  const patch = (partial: Partial<ThemeData>) => setTheme((t) => (t ? { ...t, ...partial } : t))

  async function save() {
    if (!theme) return
    setSaving(true)
    const data = await api.patch<ThemeData>("/api/admin/theme", {
      logoUrl: theme.logoUrl,
      primaryColor: theme.primaryColor,
      accentColor: theme.accentColor,
      radius: Number(theme.radius),
      announcementText: theme.announcementText,
      announcementActive: theme.announcementActive,
      tagline: theme.tagline,
      footerAbout: theme.footerAbout,
    })
    setSaving(false)
    if (data) setTheme(data)
  }

  if (!theme) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-secondary" />
        <div className="h-96 animate-pulse rounded-xl bg-secondary" />
      </div>
    )
  }

  return (
    <div>
      <AdminPageHeader
        title="Thème de la boutique"
        description="Couleurs, logo et bandeau — appliqués à la boutique publique sans toucher au code."
        actions={
          <Button onClick={save} disabled={saving} className="bg-brand text-brand-foreground hover:brightness-95">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer le thème
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Palette className="h-4 w-4 text-brand-foreground" /> Couleurs & arrondis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => patch({ primaryColor: p.primary, accentColor: p.accent })}
                  className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition hover:shadow-sm"
                  aria-label={`Préréglage ${p.name}`}
                >
                  <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: p.primary }} />
                  <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: p.accent }} />
                  {p.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Couleur principale (en-têtes, boutons sombres)</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.primaryColor}
                    onChange={(e) => patch({ primaryColor: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded-md border bg-card"
                    aria-label="Couleur principale"
                  />
                  <Input value={theme.primaryColor} onChange={(e) => patch({ primaryColor: e.target.value })} className="h-9 font-mono text-xs" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Couleur d'accent (CTA, badges promo)</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={theme.accentColor}
                    onChange={(e) => patch({ accentColor: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded-md border bg-card"
                    aria-label="Couleur d'accent"
                  />
                  <Input value={theme.accentColor} onChange={(e) => patch({ accentColor: e.target.value })} className="h-9 font-mono text-xs" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Arrondi des angles : {theme.radius}px</Label>
              <Slider value={[theme.radius]} min={0} max={24} step={1} onValueChange={([v]) => patch({ radius: v })} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="logo-upload">Logo personnalisé (URL ou fichier)</Label>
              <div className="flex gap-2">
                <Input
                  id="logo-url"
                  value={theme.logoUrl ?? ""}
                  placeholder="/logo.svg (défaut)"
                  onChange={(e) => patch({ logoUrl: e.target.value })}
                  className="h-9 font-mono text-xs"
                />
                <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-secondary">
                  <Upload className="h-3.5 w-3.5" /> Envoyer
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      e.currentTarget.value = ""
                      if (!f) return
                      toast.info("Envoi du logo…")
                      try {
                        const { url } = await uploadImageFile(f)
                        patch({ logoUrl: url })
                      } catch (err) {
                        toast.error(err instanceof Error && err.message ? err.message : "Échec de l'envoi.")
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Aperçu en direct</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-xl border" style={{ borderRadius: theme.radius }}>
                <div className="px-4 py-2 text-center text-[11px] font-medium tracking-wide text-white" style={{ backgroundColor: theme.primaryColor }}>
                  {theme.announcementActive ? theme.announcementText ?? "Bandeau d'annonce" : "Bandeau masqué"}
                </div>
                <div className="flex items-center gap-2 border-b bg-white px-4 py-3">
                  <Logo className="h-8 w-8" />
                  <div className="leading-tight">
                    <p className="text-sm font-extrabold">{theme.storeName}</p>
                    <p className="text-[10px] text-neutral-500">{theme.tagline}</p>
                  </div>
                </div>
                <div className="space-y-3 bg-neutral-50 p-4">
                  <div className="grid grid-cols-3 gap-2">
                    {["Produit A", "Produit B", "Produit C"].map((n) => (
                      <div key={n} className="space-y-1.5 rounded-lg border bg-white p-2 shadow-sm" style={{ borderRadius: theme.radius }}>
                        <div className="aspect-square rounded bg-neutral-200" style={{ borderRadius: theme.radius / 2 }} />
                        <p className="text-[11px] font-medium">{n}</p>
                        <p className="text-[11px] font-bold">{formatXOF(15000)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center pt-1">
                    <span
                      className="rounded-lg px-6 py-2.5 text-sm font-bold shadow"
                      style={{ backgroundColor: theme.accentColor, color: "#18181b", borderRadius: theme.radius }}
                    >
                      Ajouter au panier
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Les couleurs sont appliquées à toute la boutique publique dès l'enregistrement.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4 text-brand-foreground" /> Bandeau d'annonce</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm font-medium">Afficher sur la boutique</p>
                <Switch checked={theme.announcementActive} onCheckedChange={(v) => patch({ announcementActive: v })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-txt">Message</Label>
                <Textarea id="ann-txt" rows={2} value={theme.announcementText ?? ""} onChange={(e) => patch({ announcementText: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tagline">Slogan (sous le nom)</Label>
                <Input id="tagline" value={theme.tagline} onChange={(e) => patch({ tagline: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="about">Présentation (pied de page)</Label>
                <Textarea id="about" rows={3} value={theme.footerAbout ?? ""} onChange={(e) => patch({ footerAbout: e.target.value })} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
