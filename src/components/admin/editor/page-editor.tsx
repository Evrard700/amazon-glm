"use client"

// ============================================================================
// ÉDITEUR VISUEL — glisser-déposer de sections façon Elementor :
//  palette (gauche) → canvas triable (centre) → réglages générés (droite).
// Brouillon persisté via auto-save ; publication = copie draft→published +
// snapshot de version (restaurable). Les modifications impactent la boutique
// réelle UNIQUEMENT au moment de la publication.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  History,
  LayoutTemplate,
  Loader2,
  Monitor,
  MousePointerClick,
  Plus,
  Rocket,
  Smartphone,
  Tablet,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  SECTION_TYPES,
  sectionDefaultProps,
  sectionTypeDef,
  type PageSectionData,
} from "@/components/storefront/sections/registry"
import { SectionSettingsForm } from "@/components/admin/editor/section-settings-form"
import { InlineCanvas } from "@/components/admin/editor/inline-canvas"

const PALETTE_GROUPS: { title: string; types: string[] }[] = [
  { title: "Essentiels", types: ["hero", "promo-banner", "usp-bar"] },
  { title: "Produits", types: ["product-grid", "categories", "collection-highlight"] },
  { title: "Confiance", types: ["testimonials", "reviews", "logos", "faq"] },
  { title: "Contenu", types: ["rich-text", "video", "countdown", "newsletter", "seo-text"] },
]

const DEVICE_WIDTHS: Record<string, string> = {
  desktop: "w-full",
  tablet: "w-full max-w-2xl",
  mobile: "w-full max-w-[390px]",
}

function newSectionId() {
  return `sec-${Math.random().toString(36).slice(2, 9)}`
}

interface VersionRow {
  id: string
  version: number
  label: string | null
  createdAt: string
}

export function PageEditor({
  page,
}: {
  page: { id: string; title: string; slug: string; isSystem: boolean; isPublished: boolean; sections: PageSectionData[] }
}) {
  const [sections, setSections] = useState<PageSectionData[]>(page.sections)
  const [title, setTitle] = useState(page.title)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop")
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">("saved")
  const [publishing, setPublishing] = useState(false)
  const [versions, setVersions] = useState<VersionRow[] | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mode, setMode] = useState<"direct" | "structured">("direct")
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const selected = sections.find((s) => s.id === selectedId) ?? null
  const selectedDef = selected ? sectionTypeDef(selected.type) : undefined

  // ---------- Auto-save (brouillon) ----------
  const persist = useCallback(async (nextSections: PageSectionData[], nextTitle: string) => {
    setSaveState("saving")
    try {
      const res = await fetch(`/api/admin/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftData: { sections: nextSections }, title: nextTitle }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? "échec")
      dirtyRef.current = false
      setSaveState("saved")
    } catch {
      setSaveState("error")
    }
  }, [page.id])

  const updateSections = useCallback(
    (next: PageSectionData[], autoSelect?: string) => {
      setSections(next)
      dirtyRef.current = true
      setSaveState("dirty")
      if (autoSelect) setSelectedId(autoSelect)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => persist(next, title), 1200)
    },
    [persist, title],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // ---------- Actions ----------
  function addSection(type: string) {
    const def = sectionTypeDef(type)
    if (!def) return
    const section: PageSectionData = { id: newSectionId(), type, props: sectionDefaultProps(type) }
    const idx = selectedId ? sections.findIndex((s) => s.id === selectedId) : sections.length - 1
    const next = [...sections]
    next.splice(idx + 1, 0, section)
    updateSections(next, section.id)
    setPaletteOpen(false)
    toast.success(`Section « ${def.label} » ajoutée.`)
  }

  function moveSection(id: string, dir: -1 | 1) {
    const idx = sections.findIndex((s) => s.id === id)
    if (idx === -1) return
    const target = idx + dir
    if (target < 0 || target >= sections.length) return
    updateSections(arrayMove(sections, idx, target), id)
  }

  function duplicateSection(id: string) {
    const idx = sections.findIndex((s) => s.id === id)
    if (idx === -1) return
    const clone = { ...sections[idx], id: newSectionId() }
    const next = [...sections]
    next.splice(idx + 1, 0, clone)
    updateSections(next, clone.id)
  }

  function removeSection(id: string) {
    updateSections(sections.filter((s) => s.id !== id), id === selectedId ? undefined : undefined)
    if (id === selectedId) setSelectedId(null)
  }

  function toggleHidden(id: string) {
    updateSections(sections.map((s) => (s.id === id ? { ...s, hidden: !s.hidden } : s)))
  }

  function patchProps(id: string, props: Record<string, unknown>) {
    updateSections(sections.map((s) => (s.id === id ? { ...s, props } : s)))
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sections.findIndex((s) => s.id === active.id)
    const newIndex = sections.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    updateSections(arrayMove(sections, oldIndex, newIndex), active.id as string)
  }

  async function loadVersions() {
    try {
      const res = await fetch(`/api/admin/pages/${page.id}/versions`)
      const json = await res.json()
      if (json.ok) setVersions(json.data)
    } catch {
      toast.error("Impossible de charger les versions.")
    }
  }

  async function publish() {
    setPublishing(true)
    try {
      // S'assurer que le dernier brouillon est bien persisté avant publication
      if (dirtyRef.current) await persist(sections, title)
      const res = await fetch(`/api/admin/pages/${page.id}/publish`, { method: "POST" })
      const json = await res.json()
      if (json.ok) {
        toast.success("Modifications publiées — la boutique affiche la nouvelle version.")
        setVersions(null)
      } else {
        toast.error(json.error ?? "Publication impossible.")
      }
    } catch {
      toast.error("Erreur réseau pendant la publication.")
    } finally {
      setPublishing(false)
    }
  }

  async function restore(version: number) {
    const res = await fetch(`/api/admin/pages/${page.id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    })
    const json = await res.json()
    if (json.ok) {
      toast.success(`Version ${version} restaurée dans le brouillon — relisez puis publiez.`)
      // Recharge le brouillon depuis le serveur (source de vérité)
      const pageRes = await fetch(`/api/admin/pages/${page.id}`)
      const pageJson = await pageRes.json()
      if (pageJson.ok && pageJson.data.draftData) {
        const draft = JSON.parse(pageJson.data.draftData)
        setSections(draft.sections ?? [])
        dirtyRef.current = false
        setSaveState("saved")
      }
      setVersions(null)
    } else {
      toast.error(json.error ?? "Restauration impossible.")
    }
  }

  const publicHref = page.slug === "home" ? "/" : `/pages/${page.slug}`

  return (
    // Éditeur immersif plein écran. z-[45] : AU-DESSUS de l'en-tête admin sticky
    // (z-40) pour que sa propre barre d'outils (retour, mode, Publier…) soit
    // cliquable, mais EN-DESSOUS des portails Radix (z-50 : Popover/Select/Dialog)
    // pour que les menus de l'éditeur s'affichent par-dessus le canvas.
    <div className="fixed inset-0 z-[45] flex flex-col bg-secondary/50">
      {/* ===== Barre supérieure ===== */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
        <Link
          href="/admin/storefront"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-secondary"
        >
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Pages</span>
        </Link>
        <div className="hidden h-6 w-px bg-border sm:block" />
        <div className="min-w-0">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              dirtyRef.current = true
              setSaveState("dirty")
              if (timerRef.current) clearTimeout(timerRef.current)
              timerRef.current = setTimeout(() => persist(sections, e.target.value), 1200)
            }}
            className="h-8 w-44 border-transparent bg-transparent px-1 text-sm font-bold sm:w-64"
            aria-label="Titre de la page"
          />
          <p className="px-1 text-[11px] text-muted-foreground">/{page.slug === "home" ? "" : `pages/${page.slug}`}</p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* État d'enregistrement */}
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex" aria-live="polite">
            {saveState === "saved" && (<><Check className="h-3.5 w-3.5 text-emerald-600" /> Brouillon enregistré</>)}
            {saveState === "saving" && (<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enregistrement…</>)}
            {saveState === "dirty" && (<span className="text-amber-600">Modifications en cours…</span>)}
            {saveState === "error" && (<span className="text-rose-600">Échec — réessayez</span>)}
          </span>

          {/* Mode d'édition : direct (Elementor) ou structuré (palette + panneau) */}
        <div className="mr-1 flex overflow-hidden rounded-lg border">
          {([["direct", MousePointerClick, "Édition directe"], ["structured", LayoutTemplate, "Structuré"]] as const).map(([m, Icon, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition",
                mode === m ? "bg-brand text-brand-foreground" : "bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
              aria-label={label}
              aria-pressed={mode === m}
              title={label}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden lg:inline">{m === "direct" ? "Directe" : "Structuré"}</span>
            </button>
          ))}
        </div>

        {/* Aperçu mobile/tablette/desktop */}
          <div className="flex overflow-hidden rounded-lg border">
            {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([d, Icon]) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={cn("px-2.5 py-1.5 transition", device === d ? "bg-brand text-brand-foreground" : "bg-card hover:bg-secondary")}
                aria-label={`Aperçu ${d}`}
                aria-pressed={device === d}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          {/* Versions */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9" onClick={loadVersions}>
                <History className="h-4 w-4" /> <span className="hidden md:inline">Versions</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="p-3">
                <p className="mb-2 text-sm font-semibold">Historique des publications</p>
                {!versions && <p className="py-4 text-center text-xs text-muted-foreground">Chargement…</p>}
                {versions && versions.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">Aucune version publiée.</p>
                )}
                <ul className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto">
                  {versions?.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Version {v.version}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(v.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => restore(v.version)}>
                        Restaurer
                      </Button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">La restauration recharge le brouillon : relisez puis publiez.</p>
              </div>
            </PopoverContent>
          </Popover>

          {/* Aperçu brouillon */}
          <Button variant="outline" className="h-9" asChild>
            <a href={`/preview/${page.id}`} target="_blank" rel="noreferrer">Aperçu</a>
          </Button>

          {/* Lien boutique */}
          {page.isPublished && (
            <Button variant="ghost" className="hidden h-9 text-muted-foreground md:flex" asChild>
              <a href={publicHref} target="_blank" rel="noreferrer">Voir en ligne</a>
            </Button>
          )}

          {/* Publication */}
          <Button onClick={publish} disabled={publishing || saveState === "error"} className="h-9 bg-brand font-semibold text-brand-foreground hover:brightness-95">
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publier
          </Button>
        </div>
      </header>

      {/* ===== Corps 3 colonnes ===== */}
      <div className="flex min-h-0 flex-1">
        {/* Palette (gauche) */}
        <aside className="scrollbar-thin hidden w-60 shrink-0 overflow-y-auto border-r bg-background p-3 lg:block">
          <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Ajouter une section</p>
          {PALETTE_GROUPS.map((group) => (
            <div key={group.title} className="mb-3">
              <p className="mb-1.5 px-1 text-[11px] font-semibold text-muted-foreground/70">{group.title}</p>
              <ul className="space-y-1">
                {group.types.map((type) => {
                  const def = sectionTypeDef(type)
                  if (!def) return null
                  return (
                    <li key={type}>
                      <button
                        onClick={() => addSection(type)}
                        className="group flex w-full flex-col rounded-lg border bg-card px-2.5 py-2 text-left transition hover:border-brand/60 hover:shadow-sm"
                      >
                        <span className="text-sm font-medium group-hover:text-brand-foreground">{def.label}</span>
                        {def.description && <span className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{def.description}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </aside>

        {/* Bouton palette mobile */}
        {!paletteOpen && (
          <button
            onClick={() => setPaletteOpen(true)}
            className="fixed bottom-5 left-5 z-40 flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-brand-foreground shadow-xl lg:hidden"
          >
            <Plus className="h-4 w-4" /> Section
          </button>
        )}
        {paletteOpen && (
          <div className="fixed inset-0 z-40 bg-foreground/40 lg:hidden" onClick={() => setPaletteOpen(false)}>
            <div className="scrollbar-thin absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-background p-4" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold">Ajouter une section</p>
                <Button variant="ghost" size="icon" onClick={() => setPaletteOpen(false)} aria-label="Fermer"><X className="h-4 w-4" /></Button>
              </div>
              {PALETTE_GROUPS.map((group) => (
                <div key={group.title} className="mb-3">
                  <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground/70">{group.title}</p>
                  <ul className="grid grid-cols-2 gap-1.5">
                    {group.types.map((type) => {
                      const def = sectionTypeDef(type)
                      if (!def) return null
                      return (
                        <li key={type}>
                          <button onClick={() => addSection(type)} className="w-full rounded-lg border bg-card px-2 py-2 text-left text-sm font-medium hover:border-brand/60">
                            {def.label}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Canvas (centre) */}
        <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto p-4">
          {mode === "direct" ? (
            <InlineCanvas
              sections={sections}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSectionsChange={updateSections}
              onPatchProps={patchProps}
              onOpenSettings={setSelectedId}
              onAddSection={() => {
                if (window.matchMedia("(min-width: 1024px)").matches) {
                  toast.info("Choisissez un type de section dans la palette à gauche.")
                } else {
                  setPaletteOpen(true)
                }
              }}
              deviceWidth={DEVICE_WIDTHS[device]}
              emptyHint="Choisissez un type de section dans la palette de gauche — puis cliquez directement sur ses textes pour les éditer."
            />
          ) : (
          <div className={cn("mx-auto transition-all", DEVICE_WIDTHS[device])}>
            {sections.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card/60 px-6 py-20 text-center">
                <p className="font-semibold">Page vide</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Ajoutez votre première section depuis la palette de gauche. Vos modifications sont enregistrées en brouillon puis
                  publiées d'un seul clic.
                </p>
              </div>
            ) : (
              // `id` explicite : évite le compteur de module dnd-kit ("DndDescribedBy-N") qui diffère
              // entre SSR et client → erreur d'hydratation. Distinct de tm-editor-canvas.
              <DndContext id="tm-sections-list" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {sections.map((section) => (
                      <SortableSection
                        key={section.id}
                        section={section}
                        selected={section.id === selectedId}
                        onSelect={() => setSelectedId(section.id === selectedId ? null : section.id)}
                        onMove={(dir) => moveSection(section.id, dir)}
                        onDuplicate={() => duplicateSection(section.id)}
                        onRemove={() => removeSection(section.id)}
                        onToggleHidden={() => toggleHidden(section.id)}
                        isFirst={sections[0].id === section.id}
                        isLast={sections[sections.length - 1].id === section.id}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
          )}
        </main>

        {/* Réglages (droite) */}
        <aside className="scrollbar-thin hidden w-80 shrink-0 overflow-y-auto border-l bg-background xl:block">
          {selected && selectedDef ? (
            <div className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Réglages de la section</p>
                  <p className="text-base font-bold">{selectedDef.label}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)} aria-label="Fermer les réglages">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <SectionSettingsForm
                def={selectedDef}
                section={selected}
                onChange={(props) => patchProps(selected.id, props)}
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="rounded-full bg-brand-soft p-4 text-brand-foreground">
                <GripVertical className="h-7 w-7" />
              </div>
              <p className="font-semibold">Sélectionnez une section</p>
              <p className="text-sm text-muted-foreground">
                Cliquez sur une section du canvas pour modifier son contenu, ses couleurs et ses réglages.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Panneau flottant pour la section sélectionnée (mobile/tablette) */}
      {selected && selectedDef && (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[55vh] overflow-hidden rounded-t-2xl border-t bg-background shadow-2xl xl:hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Réglages</p>
              <p className="text-sm font-bold">{selectedDef.label}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)} aria-label="Fermer"><X className="h-4 w-4" /></Button>
          </div>
          <div className="scrollbar-thin max-h-[45vh] overflow-y-auto p-4">
            <SectionSettingsForm def={selectedDef} section={selected} onChange={(props) => patchProps(selected.id, props)} />
          </div>
        </div>
      )}
    </div>
  )
}

function SortableSection({
  section,
  selected,
  isFirst,
  isLast,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
  onToggleHidden,
}: {
  section: PageSectionData
  selected: boolean
  isFirst: boolean
  isLast: boolean
  onSelect: () => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onRemove: () => void
  onToggleHidden: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  const def = sectionTypeDef(section.type)
  const Preview = def?.preview

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative overflow-hidden rounded-xl border-2 bg-card shadow-sm transition",
        selected ? "border-brand" : "border-border hover:border-brand/40",
        isDragging && "z-10 opacity-80 shadow-lg ring-2 ring-brand",
        section.hidden && "opacity-50",
      )}
    >
      {/* Barre d'outils de la section */}
      <div
        className={cn(
          "flex items-center gap-1 border-b bg-secondary/60 px-2 py-1.5",
          selected ? "bg-brand-soft" : "",
        )}
      >
        <button
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Déplacer la section"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-xs font-bold">{def?.label ?? section.type}</span>
        {section.hidden && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Masquée</span>}
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Monter"><ChevronUp className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isLast} onClick={() => onMove(1)} aria-label="Descendre"><ChevronDown className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleHidden} aria-label={section.hidden ? "Afficher" : "Masquer"}>
            {section.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate} aria-label="Dupliquer"><Copy className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onRemove} aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* Aperçu cliquable */}
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onSelect()
        }}
        className="cursor-pointer text-left"
        aria-label={`Sélectionner la section ${def?.label}`}
      >
        {Preview && <Preview props={section.props} />}
      </div>
    </div>
  )
}
