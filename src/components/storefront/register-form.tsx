"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Check,
  Eye,
  EyeOff,
  Gift,
  Loader2,
  Mail,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Logo } from "@/components/storefront/logo"
import { useCartStore } from "@/lib/cart-store"
import { cn } from "@/lib/utils"

/** Inscription client — code de parrainage optionnel vérifié en direct. */
export function RegisterForm({
  initialReferral,
  initialReferrerName,
  next,
}: {
  initialReferral?: string
  initialReferrerName?: string | null
  next?: string
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [referralCode, setReferralCode] = useState(initialReferral?.toUpperCase() ?? "")
  // ?ref=CODE déjà validé côté serveur → état initial « valide »
  const [referralState, setReferralState] = useState<
    { status: "idle" } | { status: "checking" } | { status: "valid"; referrerName: string } | { status: "invalid"; error: string }
  >(() =>
    initialReferral && initialReferrerName
      ? { status: "valid", referrerName: initialReferrerName }
      : { status: "idle" },
  )
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Indicateurs de robustesse du mot de passe
  const pwChecks = [
    { label: "8 caractères minimum", ok: password.length >= 8 },
    { label: "Au moins une lettre", ok: /[a-zA-Z]/.test(password) },
    { label: "Au moins un chiffre", ok: /\d/.test(password) },
  ]

  async function validateReferral(code: string) {
    const clean = code.trim().toUpperCase()
    if (!clean) {
      setReferralState({ status: "idle" })
      return
    }
    setReferralState({ status: "checking" })
    try {
      const res = await fetch("/api/account/validate-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean }),
      })
      const json = await res.json()
      if (json.ok && json.data.valid) {
        setReferralState({ status: "valid", referrerName: json.data.referrerName })
      } else {
        setReferralState({ status: "invalid", error: json.data?.error ?? json.error ?? "Code invalide." })
      }
    } catch {
      setReferralState({ status: "invalid", error: "Impossible de vérifier ce code pour le moment." })
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setError(null)
    if (name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email) || phone.trim().length < 6 || password.length < 8) {
      setError("Vérifiez vos informations : nom, email valide, téléphone et mot de passe (8 caractères min.).")
      return
    }
    if (referralState.status === "invalid") {
      setError("Le code de parrainage saisi est invalide — corrigez-le ou laissez le champ vide.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          password,
          referralCode: referralCode.trim() ? referralCode.trim().toUpperCase() : undefined,
          marketingConsent,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error ?? "L'inscription a échoué.")
        setLoading(false)
        return
      }
      useCartStore.getState().fetchCart() // rattache le panier en cours au nouveau compte
      toast.success("Bienvenue ! Votre code de parrainage est actif.", {
        description: "Partagez-le pour gagner des crédits boutique sur chaque commande de vos filleuls.",
      })
      router.push(next && next.startsWith("/") ? next : "/account")
      router.refresh()
    } catch {
      setError("Erreur réseau. Réessayez.")
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:py-14">
      <div className="mb-4 flex flex-col items-center text-center">
        <Link href="/" className="flex items-center gap-2" aria-label="Téranga Market — Accueil">
          <Logo className="h-10 w-10" />
          <span className="text-xl font-extrabold tracking-tight">Téranga Market</span>
        </Link>
      </div>
      <Card className="shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-xl">
            <UserPlus className="h-5 w-5 text-brand-foreground" /> Créer mon compte
          </CardTitle>
          <CardDescription>
            Commandez plus vite, gardez vos fichiers numériques et gagnez avec le parrainage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reg-name">Nom complet *</Label>
                <Input id="reg-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aminata Traoré" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-phone">Téléphone *</Label>
                <Input id="reg-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+225 07 00 00 00 00" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="reg-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" className="pl-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-password">Mot de passe *</Label>
              <div className="relative">
                <Input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  aria-describedby="pw-hints"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div id="pw-hints" className="flex flex-wrap gap-1.5 pt-1">
                {pwChecks.map((check) => (
                  <span
                    key={check.label}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition",
                      check.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "border-border bg-muted/50 text-muted-foreground",
                    )}
                  >
                    {check.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {check.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-referral" className="flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5 text-brand-foreground" /> Code de parrainage (optionnel)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="reg-referral"
                  value={referralCode}
                  onChange={(e) => {
                    setReferralCode(e.target.value.toUpperCase())
                    setReferralState({ status: "idle" })
                  }}
                  placeholder="EX : AMIN-0A1"
                  className="tracking-wide uppercase"
                  aria-describedby="referral-feedback"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => validateReferral(referralCode)}
                  disabled={!referralCode.trim() || referralState.status === "checking"}
                  className="gap-1.5"
                >
                  {referralState.status === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                  Appliquer
                </Button>
              </div>
              <div id="referral-feedback" aria-live="polite">
                {referralState.status === "valid" && (
                  <p className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <Sparkles className="h-3.5 w-3.5" /> Vous serez parrainé(e) par {referralState.referrerName} — il/elle touchera
                    une commission sur vos commandes payées, et vous progressez vers son remboursement intégral.
                  </p>
                )}
                {referralState.status === "invalid" && (
                  <p className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {referralState.error}
                  </p>
                )}
              </div>
            </div>

            <label htmlFor="reg-consent" className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox
                id="reg-consent"
                checked={marketingConsent}
                onCheckedChange={(v) => setMarketingConsent(v === true)}
                className="mt-0.5"
              />
              <span className="text-muted-foreground">
                Je souhaite recevoir les offres et nouveautés par email.
              </span>
            </label>

            <Button type="submit" disabled={loading} className="w-full gap-2 bg-brand font-bold text-brand-foreground hover:brightness-95">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {loading ? "Création du compte…" : "Créer mon compte"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center border-t px-6 py-4 text-sm">
          <p className="text-muted-foreground">
            Déjà inscrit ?{" "}
            <Link
              href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
              className="font-semibold text-brand-foreground underline underline-offset-2"
            >
              Se connecter
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
