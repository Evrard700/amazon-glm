"use client"

// Formulaire d'avis — étoiles interactives, POST /api/products/[slug]/reviews.
import { useState } from "react"
import { CheckCircle2, Loader2, Star } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export function ReviewForm({ slug }: { slug: string }) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [title, setTitle] = useState("")
  const [comment, setComment] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [doneMessage, setDoneMessage] = useState("")

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (rating < 1) {
      toast.error("Choisissez une note de 1 à 5 étoiles.")
      return
    }
    if (comment.trim().length < 3) {
      toast.error("Votre commentaire est trop court (3 caractères minimum).")
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/products/${slug}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, title: title.trim(), comment: comment.trim() }),
      })
      const json = (await res.json()) as { ok: boolean; data?: { message?: string }; error?: string }
      if (json.ok) {
        setDone(true)
        setDoneMessage(json.data?.message ?? "Avis envoyé, en attente de modération.")
        toast.success("Merci ! Votre avis a bien été envoyé.")
      } else {
        toast.error(json.error ?? "Impossible d'envoyer votre avis pour le moment.")
      }
    } catch {
      toast.error("Erreur réseau. Veuillez réessayer.")
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
        {doneMessage}
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div>
        <p className="mb-1.5 text-sm font-semibold">Votre note *</p>
        <div className="flex gap-1" role="radiogroup" aria-label="Note de 1 à 5 étoiles">
          {[1, 2, 3, 4, 5].map((i) => {
            const active = (hover || rating) >= i
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={rating === i}
                aria-label={`${i} étoile${i > 1 ? "s" : ""}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(i)}
                className="rounded p-0.5 transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              >
                <Star
                  className={cn(
                    "h-7 w-7 transition",
                    active ? "fill-brand stroke-brand" : "fill-none stroke-muted-foreground/40",
                  )}
                />
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-title">Titre (optionnel)</Label>
        <Input
          id="review-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Ex : Excellent produit, conforme à la description"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-comment">Votre avis *</Label>
        <Textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          required
          placeholder="Partagez votre expérience : qualité, livraison, usage…"
        />
        <p className="text-xs text-muted-foreground">{comment.length}/2000 caractères</p>
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="bg-brand text-brand-foreground hover:brightness-95"
      >
        {loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />}
        Publier mon avis
      </Button>
      <p className="text-xs text-muted-foreground">
        Votre avis sera vérifié par notre équipe avant publication (réservé aux acheteurs vérifiés).
      </p>
    </form>
  )
}
