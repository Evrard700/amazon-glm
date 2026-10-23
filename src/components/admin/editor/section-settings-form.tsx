"use client"

// Formulaire généré automatiquement depuis les champs du registre des sections.
// Chaque type de champ (text, list, picker, color, range…) rend un contrôle adapté.

import { useEffect, useState } from "react"
import { GripVertical, Plus, Trash2, ChevronUp, ChevronDown, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PageSectionData, SectionField, SectionItemField, SectionTypeDef } from "@/components/storefront/sections/registry"
import { uploadImage as uploadImageFile } from "@/lib/upload-client"

interface LightData {
  products: { id: string; name: string; slug: string; type: string }[]
  collections: { slug: string; name: string }[]
  categories: { slug: string; name: string }[]
  pages: { slug: string; title: string }[]
}

export function SectionSettingsForm({
  def,
  section,
  onChange,
}: {
  def: SectionTypeDef
  section: PageSectionData
  onChange: (props: Record<string, unknown>) => void
}) {
  const [light, setLight] = useState<LightData | null>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/pages/light-data")
        const json = await res.json()
        if (json.ok) setLight(json.data)
      } catch {
        /* sélecteurs resteront vides */
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const props = section.props

  const set = (key: string, value: unknown) => onChange({ ...props, [key]: value })

  async function uploadImage(key: string, file: File) {
    toast.info("Envoi de l'image…")
    try {
      const { url } = await uploadImageFile(file)
      set(key, url)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Échec de l'envoi.")
    }
  }

  function renderScalarField(field: SectionItemField, value: unknown, onSet: (v: unknown) => void) {
    switch (field.type) {
      case "text":
        return <Input value={String(value ?? "")} placeholder={field.placeholder} onChange={(e) => onSet(e.target.value)} className="h-8 text-sm" />
      case "textarea":
        return <Textarea rows={3} value={String(value ?? "")} placeholder={field.placeholder} onChange={(e) => onSet(e.target.value)} className="text-sm" />
      case "number":
        return (
          <Input
            type="number"
            value={value === undefined || value === null ? "" : Number(value)}
            min={field.min}
            max={field.max}
            onChange={(e) => onSet(e.target.value === "" ? undefined : Number(e.target.value))}
            className="h-8 text-sm"
          />
        )
      case "icon":
      case "select":
        return (
          <Select value={String(value ?? "")} onValueChange={(v) => onSet(v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case "image":
        return <Input value={String(value ?? "")} placeholder="https://…" onChange={(e) => onSet(e.target.value)} className="h-8 font-mono text-xs" />
      default:
        return null
    }
  }

  function renderPicker(field: Extract<SectionField, { type: string }>) {
    const isMultiple = "multiple" in field && field.multiple
    const current = isMultiple ? (Array.isArray(props[field.key]) ? (props[field.key] as string[]) : []) : String(props[field.key] ?? "")

    let options: { value: string; label: string }[] = []
    if (field.type === "collection-picker" && light) options = light.collections.map((c) => ({ value: c.slug, label: c.name }))
    if (field.type === "category-picker" && light) options = light.categories.map((c) => ({ value: c.slug, label: c.name }))
    if (field.type === "page-picker" && light) options = light.pages.map((p) => ({ value: p.slug, label: p.title }))
    if (field.type === "product-picker" && light) options = light.products.map((p) => ({ value: p.id, label: `${p.name} (${p.type === "PHYSICAL" ? "physique" : p.type === "DIGITAL" ? "numérique" : "hybride"})` }))

    if (isMultiple) {
      const selected = current as string[]
      return (
        <div className="scrollbar-thin max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
          {options.length === 0 && <p className="text-xs text-muted-foreground">Chargement…</p>}
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-secondary">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[#f59e0b]"
                checked={selected.includes(o.value)}
                onChange={(e) => set(field.key, e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
              />
              <span className="line-clamp-1">{o.label}</span>
            </label>
          ))}
        </div>
      )
    }
    return (
      <Select value={String(current)} onValueChange={(v) => set(field.key, v)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="">— Aucune —</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  function renderListField(field: Extract<SectionField, { type: "list" }>) {
    const items = Array.isArray(props[field.key]) ? (props[field.key] as Record<string, unknown>[]) : []
    const setItems = (next: Record<string, unknown>[]) => set(field.key, next)

    return (
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-lg border bg-secondary/30 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">{field.itemLabel ?? "Élément"} {idx + 1}</span>
              <div className="flex gap-0.5">
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => { const next = [...items]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; setItems(next) }} aria-label="Monter">
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === items.length - 1} onClick={() => { const next = [...items]; [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]; setItems(next) }} aria-label="Descendre">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setItems(items.filter((_, i) => i !== idx))} aria-label="Supprimer">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {field.itemFields.map((sub) => (
                <div key={sub.key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{sub.label}</Label>
                  {renderScalarField(sub, item[sub.key], (v) => { const next = [...items]; next[idx] = { ...item, [sub.key]: v }; setItems(next) })}
                </div>
              ))}
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full border-dashed text-xs"
          onClick={() => {
            const blank: Record<string, unknown> = {}
            for (const sub of field.itemFields) blank[sub.key] = sub.type === "number" ? (sub.min ?? 1) : ""
            setItems([...items, blank])
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter {field.itemLabel ?? "un élément"}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {def.fields.map((field) => {
        if (field.type === "list") {
          return (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-sm font-semibold">{field.label}</Label>
              {renderListField(field)}
            </div>
          )
        }
        if (field.type === "product-picker" || field.type === "collection-picker" || field.type === "category-picker" || field.type === "page-picker") {
          return (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-sm font-semibold">{field.label}</Label>
              {renderPicker(field)}
              {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
            </div>
          )
        }
        const value = props[field.key]
        return (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-sm font-semibold" htmlFor={`f-${field.key}`}>{field.label}</Label>
            {field.type === "text" && (
              <Input id={`f-${field.key}`} value={String(value ?? "")} placeholder={field.placeholder} onChange={(e) => set(field.key, e.target.value)} className="h-9 text-sm" />
            )}
            {field.type === "textarea" && (
              <Textarea id={`f-${field.key}`} rows={3} value={String(value ?? "")} placeholder={field.placeholder} onChange={(e) => set(field.key, e.target.value)} className="text-sm" />
            )}
            {field.type === "richtext" && (
              <div className="space-y-1">
                <Textarea id={`f-${field.key}`} rows={6} value={String(value ?? "")} placeholder="<p>Contenu HTML…</p>" onChange={(e) => set(field.key, e.target.value)} className="font-mono text-xs" />
                <p className="text-xs text-muted-foreground">Balises HTML simples autorisées (les scripts sont retirés à l'affichage public).</p>
              </div>
            )}
            {field.type === "number" && (
              <Input id={`f-${field.key}`} type="number" value={value === undefined || value === null ? "" : Number(value)} min={field.min} max={field.max} onChange={(e) => set(field.key, e.target.value === "" ? undefined : Number(e.target.value))} className="h-9 text-sm" />
            )}
            {field.type === "range" && (
              <div className="space-y-1.5 pt-1.5">
                <Slider
                  value={[Number(value ?? field.min ?? 0)]}
                  min={field.min ?? 0}
                  max={field.max ?? 100}
                  step={field.step ?? 1}
                  onValueChange={([v]) => set(field.key, v)}
                />
                <p className="text-right text-xs font-semibold text-muted-foreground">{Number(value ?? 0)}</p>
              </div>
            )}
            {field.type === "switch" && (
              <Switch checked={Boolean(value)} onCheckedChange={(v) => set(field.key, v)} />
            )}
            {field.type === "color" && (
              <div className="flex gap-2">
                <input
                  type="color"
                  value={String(value ?? "#18181b")}
                  onChange={(e) => set(field.key, e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-md border bg-card"
                  aria-label={field.label}
                />
                <Input value={String(value ?? "")} onChange={(e) => set(field.key, e.target.value)} className="h-9 font-mono text-xs" />
              </div>
            )}
            {field.type === "date" && (
              <Input
                id={`f-${field.key}`}
                type="datetime-local"
                value={String(value ?? "")}
                onChange={(e) => set(field.key, e.target.value)}
                className="h-9 text-sm"
              />
            )}
            {field.type === "select" && (
              <Select value={String(value ?? "")} onValueChange={(v) => set(field.key, v)}>
                <SelectTrigger className="h-9 text-sm" id={`f-${field.key}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {field.type === "image" && (
              <div className="flex gap-2">
                <Input id={`f-${field.key}`} value={String(value ?? "")} placeholder="https://…" onChange={(e) => set(field.key, e.target.value)} className="h-9 font-mono text-xs" />
                <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-secondary">
                  <Upload className="h-3.5 w-3.5" /> Envoyer
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(field.key, f); e.currentTarget.value = "" }} />
                </label>
              </div>
            )}
            {field.type === "icon" && (
              <Select value={String(value ?? "")} onValueChange={(v) => set(field.key, v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
          </div>
        )
      })}
    </div>
  )
}
