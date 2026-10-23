"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Logo } from "@/components/storefront/logo"
import { useCartStore } from "@/lib/cart-store"

/** Connexion client — POST /api/auth/login, puis redirection vers `next`. */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setError(null)
    if (!email.trim() || !password) {
      setError("Renseignez votre email et votre mot de passe.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error ?? "Email ou mot de passe incorrect.")
        setLoading(false)
        return
      }
      const { redirectTo } = json.data as { redirectTo: string }
      // Le panier invité éventuel doit être rattaché au compte
      useCartStore.getState().fetchCart()
      toast.success("Connexion réussie. Bon retour !")
      router.push(next && next.startsWith("/") ? next : redirectTo)
      router.refresh()
    } catch {
      setError("Erreur réseau. Réessayez.")
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-10 sm:py-16">
      <Link href="/" className="mb-4 flex items-center gap-2" aria-label="Téranga Market — Accueil">
        <Logo className="h-10 w-10" />
        <span className="text-xl font-extrabold tracking-tight">Téranga Market</span>
      </Link>
      <Card className="w-full shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-xl">
            <LogIn className="h-5 w-5 text-brand-foreground" /> Connexion
          </CardTitle>
          <CardDescription>Accédez à vos commandes, téléchargements et récompenses.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                aria-invalid={!!error}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
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
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full gap-2 bg-brand font-bold text-brand-foreground hover:brightness-95"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "Connexion…" : "Se connecter"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center gap-2 border-t px-6 py-4 text-sm">
          <p className="text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link
              href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
              className="font-semibold text-brand-foreground underline underline-offset-2"
            >
              Créer un compte
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">Le parrainage vous récompense dès votre inscription.</p>
        </CardFooter>
      </Card>
    </div>
  )
}
