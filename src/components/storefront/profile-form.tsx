"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertCircle, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** Formulaire de modification du profil — PATCH /api/account/profile (Zod serveur). */
export function ProfileForm({
  initial,
}: {
  initial: { name: string; email: string; phone: string; address: string; city: string }
}) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone)
  const [address, setAddress] = useState(initial.address)
  const [city, setCity] = useState(initial.city)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setError(null)
    if (name.trim().length < 2) {
      setError("Votre nom doit contenir au moins 2 caractères.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error ?? "La mise à jour a échoué.")
        toast.error(json.error ?? "La mise à jour a échoué.")
        return
      }
      toast.success("Profil mis à jour.")
      router.refresh()
    } catch {
      setError("Erreur réseau. Réessayez.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-name">Nom complet *</Label>
          <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-email">Email (non modifiable)</Label>
          <Input id="pf-email" value={initial.email} readOnly disabled className="cursor-not-allowed bg-muted/60" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-phone">Téléphone</Label>
          <Input id="pf-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-city">Ville</Label>
          <Input id="pf-city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-address">Adresse de livraison par défaut</Label>
        <Input
          id="pf-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          autoComplete="street-address"
          placeholder="Quartier, rue, porte, repère…"
        />
      </div>
      <Button type="submit" disabled={loading} className="gap-1.5 bg-brand font-semibold text-brand-foreground hover:brightness-95">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {loading ? "Enregistrement…" : "Enregistrer mes informations"}
      </Button>
    </form>
  )
}
