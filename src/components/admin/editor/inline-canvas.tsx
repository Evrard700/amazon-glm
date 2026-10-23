"use client"

// ============================================================================
// CANVAS « ÉDITION DIRECTE » — le cœur façon Elementor/Shopify :
//  • survolez une section → contour + barre d'outils (déplacer ↑↓, masquer,
//    dupliquer, supprimer, réglages, poignée de glisser-déposer) ;
//  • CLIQUEZ un texte (titre, sous-titre, bouton, témoignage…) → éditeur
//    flottant in place, mise à jour EN DIRECT pendant la frappe ;
//  • GLISSEZ une image sur une zone image (ou sur une section à fond image)
//    → upload instantané + remplacement ;
//  • boutons « − » par élément de liste et « + Ajouter … » sous chaque liste ;
//  • glissez-déposez les sections par leur poignée pour les réordonner.
// Tout passe par patchProps → auto-save débounced du brouillon (parent).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  ImageIcon,
  Loader2,
  MousePointerClick,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { uploadImage as uploadImageFile } from "@/lib/upload-client"
import {
  SECTION_TYPES,
  sectionDefaultProps,
  sectionTypeDef,
  type PageSectionData,
  type SectionField,
  type SectionItemField,
} from "@/components/storefront/sections/registry"
import { INLINE_RENDERERS } from "@/components/admin/editor/inline-sections"

// ---------------------------------------------------------------------------
// Utilitaires de patch par chemin (« items.2.q » → props.items[2].q)
// ---------------------------------------------------------------------------
function setByPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".")
  const clone: Record<string, unknown> = Array.isArray(obj)
    ? ([...(obj as unknown as unknown[])] as unknown as Record<string, unknown>)
    : { ...(obj as Record<string, unknown>) }
  let cursor: Record<string, unknown> = clone
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    const next = cursor[k]
    const childClone = Array.isArray(next) ? ([...(next as unknown[])] as unknown as Record<string, unknown>) : { ...(next as Record<string, unknown>) }
    cursor[k] = childClone
    cursor = childClone as Record<string, unknown>
  }
  cursor[keys[keys.length - 1]] = value
  return clone as unknown as T
}

function getByPath(obj: unknown, path: string): unknown {
  let cursor: unknown = obj
  for (const k of path.split(".")) {
    if (cursor == null) return undefined
    cursor = (cursor as Record<string, unknown>)[k]
  }
  return cursor
}

function deleteIndexInList<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

// ---------------------------------------------------------------------------
// Recherche du champ (type d'éditeur) depuis les définitions des sections
// ---------------------------------------------------------------------------
interface FieldMeta {
  label: string
  type: SectionField["type"] | SectionItemField["type"]
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
  isList?: boolean
}

function findFieldMeta(defType: string, path: string): FieldMeta | null {
  const def = sectionTypeDef(defType)
  if (!def) return null
  const parts = path.split(".")
  if (parts.length === 1) {
    const f = def.fields.find((x) => x.key === parts[0])
    if (!f) return null
    const scalar = f as { min?: number; max?: number; step?: number; options?: { value: string; label: string }[] }
    return { label: f.label, type: f.type, options: scalar.options, min: scalar.min, max: scalar.max, step: scalar.step }
  }
  // Chemin liste : items.N.clé
  const listKey = parts[0]
  const itemKey = parts[parts.length - 1]
  const lf = def.fields.find((x): x is Extract<SectionField, { type: "list" }> => x.key === listKey && x.type === "list")
  if (!lf) return null
  const sf = lf.itemFields.find((x) => x.key === itemKey)
  if (!sf) return null
  return { label: sf.label, type: sf.type, options: sf.options, min: sf.min, max: sf.max, isList: true }
}

// ---------------------------------------------------------------------------
// Éditeur flottant
// ---------------------------------------------------------------------------
interface FloatingTarget {
  sectionId: string
  path: string
  rect: DOMRect
  listPath?: string
  index?: number
}

function FloatingFieldEditor({
  target,
  value,
  meta,
  onCommit,
  onClose,
}: {
  target: FloatingTarget
  value: unknown
  meta: FieldMeta | null
  onCommit: (path: string, value: unknown) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [local, setLocal] = useState<string>(() => {
    if (value == null) return ""
    if (meta?.type === "list" || meta?.type === "select") return String(value)
    if (typeof value === "number") return String(value)
    return String(value)
  })
  const [uploading, setUploading] = useState(false)

  const type = meta?.type ?? "text"
  const isNumeric = type === "number" || type === "range"
  const isColor = type === "color"
  const isImage = type === "image"
  const isBool = type === "switch"
  const isSelect = type === "select" || type === "icon"
  const isArea = type === "textarea" || type === "richtext"

  // Position : ancrée sous l'élément, bornée au viewport (mode « fixed »).
  const [pos, setPos] = useState<{ top: number; left: number }>(() => {
    const w = 320
    const left = Math.min(Math.max(8, target.rect.left), window.innerWidth - w - 8)
    const below = target.rect.bottom + 8
    const top = below + 120 > window.innerHeight ? Math.max(8, target.rect.top - 132) : below
    return { top, left }
  })

  // Échappe / clic extérieur → fermer (les commits sont déjà faits en direct).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "Enter" && !isArea && !e.shiftKey) {
        e.preventDefault()
        onClose()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener("keydown", onKey)
    // mousedown différé : laisse le clic initial de sélection se propager.
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 60)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDown)
      clearTimeout(t)
    }
  }, [onClose, isArea])

  const commit = useCallback(
    (v: unknown) => {
      onCommit(target.path, v)
    },
    [onCommit, target.path],
  )

  async function pickAndUpload() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      setUploading(true)
      try {
        const { url } = await uploadImageFile(f)
        commit(url)
        toast.success("Image mise à jour.")
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : "Échec de l'envoi.")
      } finally {
        setUploading(false)
      }
    }
    input.click()
  }

  return (
    <div
      ref={ref}
      className="fixed z-[70] w-80 rounded-xl border bg-background p-3 shadow-2xl ring-1 ring-black/5"
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-soft text-brand-foreground">
          <MousePointerClick className="h-3.5 w-3.5" />
        </span>
        <p className="flex-1 truncate text-xs font-bold">{meta?.label ?? target.path}</p>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary" aria-label="Fermer">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {(type === "text" || (isImage && false)) && (
        <Input
          autoFocus
          value={local}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setLocal(e.target.value)
            commit(e.target.value)
          }}
          className="h-9 text-sm"
        />
      )}

      {isArea && (
        <Textarea
          autoFocus
          rows={meta?.type === "richtext" ? 6 : 3}
          value={local}
          onChange={(e) => {
            setLocal(e.target.value)
            commit(e.target.value)
          }}
          className="text-sm"
          placeholder={meta?.type === "richtext" ? "<p>Contenu HTML…</p>" : "Texte…"}
        />
      )}

      {isNumeric && (
        <div className="space-y-2">
          {type === "range" ? (
            <Slider
              autoFocus
              value={[Number(local) || meta?.min || 0]}
              min={meta?.min ?? 0}
              max={meta?.max ?? 100}
              step={meta?.step ?? 1}
              onValueChange={([v]) => {
                setLocal(String(v))
                commit(v)
              }}
            />
          ) : (
            <Input
              autoFocus
              type="number"
              value={local}
              min={meta?.min}
              max={meta?.max}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                setLocal(e.target.value)
                commit(e.target.value === "" ? undefined : Number(e.target.value))
              }}
              className="h-9 text-sm"
            />
          )}
          <p className="text-right text-xs font-semibold text-muted-foreground">{type === "range" ? `${local}%` : local}</p>
        </div>
      )}

      {isColor && (
        <div className="flex gap-2">
          <input
            type="color"
            value={local || "#18181b"}
            onChange={(e) => {
              setLocal(e.target.value)
              commit(e.target.value)
            }}
            className="h-9 w-12 cursor-pointer rounded-md border bg-card"
            aria-label={meta?.label ?? "Couleur"}
          />
          <Input
            value={local}
            onChange={(e) => {
              setLocal(e.target.value)
              commit(e.target.value)
            }}
            className="h-9 font-mono text-xs"
          />
        </div>
      )}

      {isImage && (
        <div className="flex gap-2">
          <Input
            value={local}
            placeholder="/uploads/… ou https://…"
            onChange={(e) => {
              setLocal(e.target.value)
              commit(e.target.value)
            }}
            className="h-9 font-mono text-xs"
          />
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 bg-brand text-brand-foreground hover:brightness-95"
            onClick={() => void pickAndUpload()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />} Envoyer
          </Button>
        </div>
      )}

      {isBool && (
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(v) => commit(v)}
        />
      )}

      {isSelect && (
        <Select value={local} onValueChange={(v) => { setLocal(v); commit(v) }}>
          <SelectTrigger className="h-9 text-sm" autoFocus><SelectValue /></SelectTrigger>
          <SelectContent>
            {(meta?.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Check className="h-3 w-3 text-emerald-600" /> Enregistré automatiquement · Échap pour fermer
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section sortable avec overlay façon Elementor
// ---------------------------------------------------------------------------
function InlineSection({
  section,
  index,
  total,
  selected,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
  onToggleHidden,
  onFieldClick,
  onItemAction,
  onImageDrop,
}: {
  section: PageSectionData
  index: number
  total: number
  selected: boolean
  onSelect: () => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onRemove: () => void
  onToggleHidden: () => void
  onFieldClick: (sectionId: string, path: string, listPath: string | undefined, index: number | undefined, el: HTMLElement) => void
  onItemAction: (sectionId: string, action: "add" | "remove", listKey: string, index: number | undefined, el: HTMLElement) => void
  onImageDrop: (sectionId: string, key: string, file: File) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  const def = sectionTypeDef(section.type)
  const Renderer = INLINE_RENDERERS[section.type]
  const rootRef = useRef<HTMLDivElement>(null)

  const handleClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement)
    const add = el.closest<HTMLElement>("[data-tm-item-add]")
    if (add) {
      e.preventDefault()
      e.stopPropagation()
      onItemAction(section.id, "add", add.dataset.tmItemAdd!, undefined, add)
      return
    }
    const rm = el.closest<HTMLElement>("[data-tm-item-remove]")
    if (rm) {
      e.preventDefault()
      e.stopPropagation()
      const wrap = rm.closest<HTMLElement>("[data-tm-list]")
      onItemAction(section.id, "remove", wrap?.dataset.tmList ?? "", Number(wrap?.dataset.tmIndex ?? 0), rm)
      return
    }
    const itemField = el.closest<HTMLElement>("[data-tm-item-field]")
    if (itemField) {
      e.preventDefault()
      e.stopPropagation()
      const path = itemField.dataset.tmItemField!
      const parts = path.split(".")
      onFieldClick(section.id, path, parts[0], Number(parts[1]), itemField)
      return
    }
    const field = el.closest<HTMLElement>("[data-tm-field]")
    if (field) {
      e.preventDefault()
      e.stopPropagation()
      onFieldClick(section.id, field.dataset.tmField!, undefined, undefined, field)
      return
    }
    const img = el.closest<HTMLElement>("[data-tm-image]")
    if (img) {
      e.preventDefault()
      e.stopPropagation()
      onFieldClick(section.id, img.dataset.tmImage!, undefined, undefined, img)
      return
    }
    onSelect()
  }

  const handleDrop = (e: React.DragEvent) => {
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"))
    if (!file) return
    e.preventDefault()
    e.stopPropagation()
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tm-image]")
    const key = el?.dataset.tmImage ?? def?.fields.find((f) => "type" in f && f.type === "image")?.key
    if (key) onImageDrop(section.id, key, file)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "tm-inline-section group/section relative",
        isDragging && "z-20 opacity-80 ring-2 ring-brand",
        section.hidden && "opacity-40 saturate-0",
      )}
      data-selected={selected ? "1" : undefined}
    >
      {/* Étiquette + barre d'outils (visible au survol / sélection) */}
      <div className="tm-section-toolbar" contentEditable={false}>
        <button
          type="button"
          className="tm-handle"
          {...attributes}
          {...listeners}
          aria-label="Glisser pour réordonner"
          title="Glisser pour réordonner"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="tm-section-label">{def?.label ?? section.type}</span>
        <span className="tm-tools">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} title="Monter" aria-label="Monter"><ChevronUp className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={index === total - 1} onClick={() => onMove(1)} title="Descendre" aria-label="Descendre"><ChevronDown className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onToggleHidden} title={section.hidden ? "Afficher" : "Masquer"} aria-label={section.hidden ? "Afficher" : "Masquer"}>
            {section.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={onDuplicate} title="Dupliquer" aria-label="Dupliquer"><Copy className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => { onSelect(); }} title="Tous les réglages" aria-label="Tous les réglages"><Settings2 className="h-3.5 w-3.5" /></button>
          <button type="button" className="tm-remove" onClick={onRemove} title="Supprimer" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
        </span>
      </div>

      <div ref={rootRef} onClick={handleClick} onDrop={handleDrop} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault() }} className="relative">
        {Renderer ? <Renderer props={section.props} /> : (
          <div className="p-8 text-center text-sm text-muted-foreground">Section « {section.type} » non reconnue.</div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Canvas principal
// ---------------------------------------------------------------------------
export function InlineCanvas({
  sections,
  selectedId,
  onSelect,
  onSectionsChange,
  onPatchProps,
  onOpenSettings,
  onAddSection,
  deviceWidth,
  emptyHint,
}: {
  sections: PageSectionData[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onSectionsChange: (next: PageSectionData[], autoSelect?: string) => void
  onPatchProps: (id: string, props: Record<string, unknown>) => void
  onOpenSettings: (id: string) => void
  onAddSection: () => void
  deviceWidth: string
  emptyHint?: string
}) {
  const [target, setTarget] = useState<FloatingTarget | null>(null)
  const [targetValue, setTargetValue] = useState<unknown>(undefined)
  const [targetMeta, setTargetMeta] = useState<FieldMeta | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const canvasRef = useRef<HTMLDivElement>(null)

  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])

  // ---------- Ouverture de l'éditeur flottant ----------
  const openField = useCallback(
    (sectionId: string, path: string, listPath: string | undefined, index: number | undefined, el: HTMLElement) => {
      const section = sectionById.get(sectionId)
      if (!section) return
      const value = getByPath(section.props, path)
      const meta = findFieldMeta(section.type, path)
      setTargetValue(value)
      setTargetMeta(meta)
      setTarget({ sectionId, path, rect: el.getBoundingClientRect(), listPath, index })
      onSelect(sectionId)
    },
    [sectionById, onSelect],
  )

  const commitField = useCallback(
    (path: string, value: unknown) => {
      if (!target) return
      const section = sectionById.get(target.sectionId)
      if (!section) return
      onPatchProps(section.id, setByPath(section.props, path, value))
    },
    [target, sectionById, onPatchProps],
  )

  // ---------- Listes : ajout / suppression ----------
  const handleItemAction = useCallback(
    (sectionId: string, action: "add" | "remove", listKey: string, index: number | undefined) => {
      const section = sectionById.get(sectionId)
      if (!section) return
      const def = sectionTypeDef(section.type)
      if (!def) return
      const lf = def.fields.find((f): f is Extract<SectionField, { type: "list" }> => f.key === listKey && f.type === "list")
      if (!lf) return
      const list = Array.isArray(section.props[listKey]) ? (section.props[listKey] as Record<string, unknown>[]) : []
      if (action === "add") {
        const blank: Record<string, unknown> = {}
        for (const f of lf.itemFields) blank[f.key] = f.type === "number" ? (f.min ?? 1) : f.type === "icon" ? "truck" : f.type === "select" ? (f.options?.[0]?.value ?? "") : ""
        onPatchProps(sectionId, { ...section.props, [listKey]: [...list, blank] })
      } else if (action === "remove" && index != null) {
        onPatchProps(sectionId, { ...section.props, [listKey]: deleteIndexInList(list, index) })
      }
    },
    [sectionById, onPatchProps],
  )

  // ---------- Drop d'image ----------
  const handleImageDrop = useCallback(
    async (sectionId: string, key: string, file: File) => {
      const section = sectionById.get(sectionId)
      if (!section) return
      try {
        const { url } = await uploadImageFile(file)
        onPatchProps(sectionId, setByPath(section.props, key, url))
        toast.success("Image mise à jour.")
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : "Échec de l'envoi de l'image.")
      }
    },
    [sectionById, onPatchProps],
  )

  // ---------- Réordonnancement drag & drop ----------
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sections.findIndex((s) => s.id === active.id)
    const newIndex = sections.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onSectionsChange(arrayMove(sections, oldIndex, newIndex), active.id as string)
  }

  return (
    <div ref={canvasRef} className="tm-inline-root relative min-h-full">
      {/* `id` explicite : sans lui, dnd-kit génère "DndDescribedBy-N" via un compteur
          de module — des valeurs différentes côté serveur/client → erreur d'hydratation. */}
      <DndContext id="tm-editor-canvas" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className={cn("mx-auto bg-background shadow-2xl transition-all", deviceWidth)}>
            {sections.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
                <p className="font-semibold">Page vide</p>
                <p className="max-w-sm text-sm text-muted-foreground">{emptyHint ?? "Ajoutez votre première section."}</p>
                <Button onClick={onAddSection} className="bg-brand text-brand-foreground hover:brightness-95">
                  <Plus className="h-4 w-4" /> Ajouter une section
                </Button>
              </div>
            ) : (
              sections.map((section, i) => (
                <InlineSection
                  key={section.id}
                  section={section}
                  index={i}
                  total={sections.length}
                  selected={section.id === selectedId}
                  onSelect={() => onSelect(section.id === selectedId ? null : section.id)}
                  onMove={(dir) => {
                    const idx = sections.findIndex((s) => s.id === section.id)
                    const to = idx + dir
                    if (to < 0 || to >= sections.length) return
                    onSectionsChange(arrayMove(sections, idx, to), section.id)
                  }}
                  onDuplicate={() => {
                    const idx = sections.findIndex((s) => s.id === section.id)
                    const clone = { ...section, id: `sec-${Math.random().toString(36).slice(2, 9)}` }
                    const next = [...sections]
                    next.splice(idx + 1, 0, clone)
                    onSectionsChange(next, clone.id)
                  }}
                  onRemove={() => {
                    onSectionsChange(sections.filter((s) => s.id !== section.id))
                    if (section.id === selectedId) onSelect(null)
                  }}
                  onToggleHidden={() => {
                    onSectionsChange(sections.map((s) => (s.id === section.id ? { ...s, hidden: !s.hidden } : s)), section.id)
                  }}
                  onFieldClick={openField}
                  onItemAction={handleItemAction}
                  onImageDrop={handleImageDrop}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Bandeau d'invitation quand rien n'est sélectionné */}
      {sections.length > 0 && !target && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-foreground/85 px-4 py-1.5 text-xs font-medium text-background shadow-lg backdrop-blur">
          Cliquez sur un texte pour l'éditer · glissez une image sur une zone image · survolez une section pour la réorganiser
        </div>
      )}

      {/* Éditeur flottant */}
      {target && (
        <FloatingFieldEditor
          key={`${target.sectionId}:${target.path}`}
          target={target}
          value={targetValue}
          meta={targetMeta}
          onCommit={commitField}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  )
}

export { SECTION_TYPES, sectionDefaultProps }
