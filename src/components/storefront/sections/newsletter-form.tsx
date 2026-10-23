"use client"

// Formulaire d'inscription newsletter — POST /api/newsletter.
import { useState } from "react"
import { CheckCircle2, Loader2, Mail } from "lucide-react"
import { toast } from "sonner"

export function NewsletterForm({ ctaLabel }: { ctaLabel: string }) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState("")

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      toast.error("Veuillez saisir une adresse email valide.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      })
      const json = (await res.json()) as { ok: boolean; data?: { message?: string }; error?: string }
      if (json.ok) {
        setDone(true)
        setMessage(json.data?.message ?? "Merci ! Votre inscription est confirmée.")
        toast.success(message ?? "Inscription confirmée.")
        setEmail("")
      } else {
        toast.error(json.error ?? "Inscription impossible pour le moment.")
      }
    } catch {
      toast.error("Erreur réseau. Veuillez réessayer.")
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <p className="mx-auto mt-5 flex max-w-md items-center justify-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
        {message}
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-5 flex max-w-md flex-col gap-2 sm:flex-row">
      <label htmlFor="newsletter-email" className="sr-only">
        Adresse email
      </label>
      <div className="relative flex-1">
        <Mail
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          id="newsletter-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="votre@email.com"
          className="h-12 w-full rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 pl-10 pr-3 text-sm text-primary-foreground placeholder:text-primary-foreground/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-6 text-sm font-bold text-brand-foreground shadow-lg transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {ctaLabel}
      </button>
    </form>
  )
}
