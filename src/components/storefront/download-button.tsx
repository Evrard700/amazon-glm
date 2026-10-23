"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Bouton « Télécharger » d'un fichier numérique :
 * POST /api/downloads/request (vérification serveur du droit) puis
 * window.open(url signée 10 min) qui sert le fichier.
 */
export function DownloadButton({
  grantId,
  disabled = false,
  label = "Télécharger",
  variant = "default",
  className,
}: {
  grantId: string
  disabled?: boolean
  label?: string
  variant?: "default" | "outline" | "secondary"
  className?: string
}) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const res = await fetch("/api/downloads/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId }),
      })
      const json = await res.json()
      if (!json.ok) {
        toast.error(json.error ?? "Impossible de télécharger ce fichier.")
        return
      }
      const { url, fileName, remaining } = json.data as { url: string; fileName: string; remaining: number }
      window.open(url, "_blank", "noopener")
      if (remaining <= 1) {
        toast.info(`Dernier téléchargement autorisé pour « ${fileName} ».`)
      } else {
        toast.success(`Téléchargement lancé — il vous reste ${remaining} téléchargement(s).`)
      }
    } catch {
      toast.error("Erreur réseau. Réessayez.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={handleDownload}
      disabled={disabled || loading}
      className={cn("gap-1.5", variant === "default" && "bg-brand text-brand-foreground hover:brightness-95", className)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {loading ? "Préparation…" : label}
    </Button>
  )
}
