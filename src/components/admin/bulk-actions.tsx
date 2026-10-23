"use client"

import { useState } from "react"
import { Loader2, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

/**
 * Barre d'actions groupées : compteur de sélection, bouton « tout
 * désélectionner » et bouton de suppression destructive AVEC confirmation
 * obligatoire (AlertDialog). Réutilisable sur toutes les tables admin.
 */
export function BulkDeleteBar({
  count,
  entityLabel,
  confirmTitle,
  confirmDescription,
  confirmLabel = "Supprimer définitivement",
  buttonLabel = "Supprimer la sélection",
  busy,
  disabled,
  onClear,
  onConfirm,
  extraActions,
}: {
  count: number
  /** ex : « commande(s) », « client(s) », « produit(s) ». */
  entityLabel: string
  confirmTitle: string
  confirmDescription: string
  confirmLabel?: string
  buttonLabel?: string
  busy?: boolean
  disabled?: boolean
  onClear: () => void
  onConfirm: () => void | Promise<void>
  extraActions?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (count === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/40 bg-brand-soft/50 px-3 py-2">
      <span className="text-sm font-semibold text-brand-foreground">
        {count} {entityLabel} sélectionné(e)(s)
      </span>
      <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onClear}>
        <X className="h-3.5 w-3.5" /> Désélectionner
      </Button>
      <div className="ml-auto flex items-center gap-2">
        {extraActions}
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="gap-1.5" disabled={busy || disabled}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {buttonLabel}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={async () => {
                  await onConfirm()
                }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
