"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/** Champ de saisie à puces (tags, villes…). Entrée ou « , » pour valider, clic sur la puce pour retirer. */
export function ChipsInput({
  value,
  onChange,
  placeholder = "Saisir puis Entrée…",
  className,
  disabled,
}: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const [draft, setDraft] = useState("")

  function commit(raw: string) {
    const chip = raw.trim().replace(/,+$/, "")
    if (!chip) return
    if (!value.includes(chip)) onChange([...value, chip])
    setDraft("")
  }

  return (
    <div className={cn("flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border bg-transparent px-2 py-1.5", className)}>
      {value.map((chip) => (
        <Badge key={chip} variant="secondary" className="gap-1 pr-1">
          {chip}
          <button
            type="button"
            aria-label={`Retirer ${chip}`}
            className="rounded-full p-0.5 hover:bg-foreground/10"
            onClick={() => onChange(value.filter((c) => c !== chip))}
            disabled={disabled}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            commit(draft)
          } else if (e.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={value.length === 0 ? placeholder : ""}
        className="min-w-24 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}
