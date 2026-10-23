"use client"

import { useEffect, useState } from "react"
import { Save, Loader2, Megaphone, Store, Phone, Sparkles } from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { useAdminApi } from "@/components/admin/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Settings {
  storeName: string
  tagline: string
  logoUrl: string | null
  announcementText: string | null
  announcementActive: boolean
  contactEmail: string | null
  contactPhone: string | null
  whatsappNumber: string | null
  addressLine: string | null
  facebookUrl: string | null
  instagramUrl: string | null
  footerAbout: string | null
  metaTitle: string | null
  metaDescription: string | null
  freeShippingThreshold: number
  lowStockThreshold: number
  guestCheckoutEnabled: boolean
  reviewsAutoApprove: boolean
  storeOpen: boolean
}

export default function AdminSettingsPage() {
  const api = useAdminApi()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(async () => {
      const data = await api.get<Settings>("/api/admin/settings")
      if (data) setSettings(data)
    }, 0)
    return () => clearTimeout(t)
  }, [api])

  const patch = (partial: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...partial } : s))

  async function save() {
    if (!settings) return
    setSaving(true)
    const data = await api.patch<Settings>("/api/admin/settings", {
      storeName: settings.storeName,
      tagline: settings.tagline,
      announcementText: settings.announcementText,
      announcementActive: settings.announcementActive,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      whatsappNumber: settings.whatsappNumber,
      addressLine: settings.addressLine,
      facebookUrl: settings.facebookUrl,
      instagramUrl: settings.instagramUrl,
      footerAbout: settings.footerAbout,
      metaTitle: settings.metaTitle,
      metaDescription: settings.metaDescription,
      freeShippingThreshold: Number(settings.freeShippingThreshold),
      lowStockThreshold: Number(settings.lowStockThreshold),
      guestCheckoutEnabled: settings.guestCheckoutEnabled,
      reviewsAutoApprove: settings.reviewsAutoApprove,
      storeOpen: settings.storeOpen,
    })
    setSaving(false)
    if (data) setSettings(data)
  }

  if (!settings) {
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
        title="Paramètres de la boutique"
        description="Identité, coordonnées et règles commerciales de Téranga Market."
        actions={
          <Button onClick={save} disabled={saving} className="bg-brand text-brand-foreground hover:brightness-95">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4 text-brand-foreground" /> Identité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="storeName">Nom de la boutique</Label>
              <Input id="storeName" value={settings.storeName} onChange={(e) => patch({ storeName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tagline">Slogan</Label>
              <Input id="tagline" value={settings.tagline} onChange={(e) => patch({ tagline: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="footerAbout">Texte du pied de page</Label>
              <Textarea id="footerAbout" rows={3} value={settings.footerAbout ?? ""} onChange={(e) => patch({ footerAbout: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="metaTitle">Titre SEO</Label>
              <Input id="metaTitle" value={settings.metaTitle ?? ""} onChange={(e) => patch({ metaTitle: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="metaDescription">Description SEO</Label>
              <Textarea id="metaDescription" rows={2} value={settings.metaDescription ?? ""} onChange={(e) => patch({ metaDescription: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Phone className="h-4 w-4 text-brand-foreground" /> Contact & réseaux</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contactEmail">Email</Label>
                <Input id="contactEmail" value={settings.contactEmail ?? ""} onChange={(e) => patch({ contactEmail: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactPhone">Téléphone</Label>
                <Input id="contactPhone" value={settings.contactPhone ?? ""} onChange={(e) => patch({ contactPhone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whatsappNumber">WhatsApp</Label>
              <Input id="whatsappNumber" value={settings.whatsappNumber ?? ""} onChange={(e) => patch({ whatsappNumber: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addressLine">Adresse</Label>
              <Input id="addressLine" value={settings.addressLine ?? ""} onChange={(e) => patch({ addressLine: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="facebookUrl">Facebook (URL)</Label>
                <Input id="facebookUrl" value={settings.facebookUrl ?? ""} onChange={(e) => patch({ facebookUrl: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="instagramUrl">Instagram (URL)</Label>
                <Input id="instagramUrl" value={settings.instagramUrl ?? ""} onChange={(e) => patch({ instagramUrl: e.target.value })} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="h-4 w-4 text-brand-foreground" /> Bandeau d'annonce</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Afficher le bandeau</p>
                <p className="text-xs text-muted-foreground">Barre sombre en haut de la boutique.</p>
              </div>
              <Switch checked={settings.announcementActive} onCheckedChange={(v) => patch({ announcementActive: v })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="announcement">Message</Label>
              <Textarea id="announcement" rows={2} value={settings.announcementText ?? ""} onChange={(e) => patch({ announcementText: e.target.value })} placeholder="🚚 Livraison offerte dès 50 000 FCFA…" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-brand-foreground" /> Règles commerciales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="freeShippingThreshold">Livraison offerte dès (FCFA)</Label>
                <Input id="freeShippingThreshold" type="number" min={0} value={settings.freeShippingThreshold} onChange={(e) => patch({ freeShippingThreshold: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lowStockThreshold">Seuil stock faible</Label>
                <Input id="lowStockThreshold" type="number" min={0} value={settings.lowStockThreshold} onChange={(e) => patch({ lowStockThreshold: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Commande sans compte (invité)</p>
                <p className="text-xs text-muted-foreground">Autorise le checkout sans inscription.</p>
              </div>
              <Switch checked={settings.guestCheckoutEnabled} onCheckedChange={(v) => patch({ guestCheckoutEnabled: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Approbation automatique des avis</p>
                <p className="text-xs text-muted-foreground">Désactivé : les avis des acheteurs vérifiés passent par la modération marketing.</p>
              </div>
              <Switch checked={settings.reviewsAutoApprove} onCheckedChange={(v) => patch({ reviewsAutoApprove: v })} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
