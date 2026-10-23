"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, Truck, X, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { AdminPageHeader } from "@/components/admin/page-header"
import { useAdminApi } from "@/components/admin/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { formatXOF } from "@/lib/money"

interface Zone {
  id: string
  name: string
  citiesJson: string
  baseCost: number
  estimatedDaysMin: number
  estimatedDaysMax: number
  position: number
  isActive: boolean
}

export default function AdminShippingSettingsPage() {
  const api = useAdminApi()
  const [zones, setZones] = useState<Zone[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [newZone, setNewZone] = useState({ name: "", cities: "", baseCost: "1500", estimatedDaysMin: "1", estimatedDaysMax: "3" })

  async function load() {
    const data = await api.get<Zone[]>("/api/admin/settings/shipping-zones")
    if (data) setZones(data)
  }

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [api])

  async function removeZone(id: string) {
    const data = await api.del(`/api/admin/settings/shipping-zones?id=${id}`)
    if (data) {
      toast.success("Zone supprimée.")
      void load()
    }
  }

  async function toggle(id: string, isActive: boolean) {
    const data = await api.patch(`/api/admin/settings/shipping-zones?id=${id}`, { isActive })
    if (data) void load()
  }

  if (!zones) {
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
        title="Zones de livraison"
        description="Tarifs et délais par zone. La livraison devient gratuite au seuil défini dans les paramètres généraux."
        actions={
          <Button onClick={() => setCreating(true)} className="bg-brand text-brand-foreground hover:brightness-95">
            <Plus className="h-4 w-4" /> Nouvelle zone
          </Button>
        }
      />

      {creating && (
        <div className="mb-5 rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-semibold">Nouvelle zone</p>
            <Button variant="ghost" size="icon" onClick={() => setCreating(false)} aria-label="Annuler"><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nom de la zone</Label>
              <Input value={newZone.name} onChange={(e) => setNewZone((z) => ({ ...z, name: e.target.value }))} placeholder="Ex : Abidjan Ouest" />
            </div>
            <div className="space-y-1.5">
              <Label>Villes / quartiers (séparés par des virgules)</Label>
              <Input value={newZone.cities} onChange={(e) => setNewZone((z) => ({ ...z, cities: e.target.value }))} placeholder="Cocody, Plateau, Marcory" />
            </div>
            <div className="space-y-1.5">
              <Label>Coût de livraison (FCFA)</Label>
              <Input type="number" min={0} value={newZone.baseCost} onChange={(e) => setNewZone((z) => ({ ...z, baseCost: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Délai min (jours)</Label>
                <Input type="number" min={0} value={newZone.estimatedDaysMin} onChange={(e) => setNewZone((z) => ({ ...z, estimatedDaysMin: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Délai max (jours)</Label>
                <Input type="number" min={0} value={newZone.estimatedDaysMax} onChange={(e) => setNewZone((z) => ({ ...z, estimatedDaysMax: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              className="bg-brand text-brand-foreground hover:brightness-95"
              onClick={async () => {
                const cities = newZone.cities.split(",").map((c) => c.trim()).filter(Boolean)
                if (!newZone.name || cities.length === 0) {
                  toast.error("Nom et au moins une ville requis.")
                  return
                }
                const data = await api.post("/api/admin/settings/shipping-zones", {
                  name: newZone.name,
                  cities,
                  baseCost: Number(newZone.baseCost),
                  estimatedDaysMin: Number(newZone.estimatedDaysMin),
                  estimatedDaysMax: Number(newZone.estimatedDaysMax),
                })
                if (data) {
                  toast.success("Zone créée.")
                  setCreating(false)
                  setNewZone({ name: "", cities: "", baseCost: "1500", estimatedDaysMin: "1", estimatedDaysMax: "3" })
                  void load()
                }
              }}
            >
              Créer la zone
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {zones.map((z) => (
          <div key={z.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
            <span className="rounded-lg bg-brand-soft p-2 text-brand-foreground"><Truck className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{z.name}</p>
              <p className="truncate text-xs text-muted-foreground">{z.citiesJson.replace(/[\[\]"]/g, "").split(",").join(" · ")}</p>
            </div>
            <Badge variant="secondary" className="font-semibold">{formatXOF(z.baseCost)}</Badge>
            <p className="text-xs text-muted-foreground">{z.estimatedDaysMin}–{z.estimatedDaysMax} j</p>
            <Switch checked={z.isActive} onCheckedChange={(v) => toggle(z.id, v)} />
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => removeZone(z.id)} aria-label="Supprimer la zone">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
