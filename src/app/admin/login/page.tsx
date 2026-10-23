"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Loader2, Lock, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Logo } from "@/components/storefront/logo"

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, staffLogin: true }),
      })
      const json = await res.json()
      if (json.ok) {
        router.push(json.data.redirectTo)
        router.refresh()
      } else {
        setError(json.error ?? "Connexion impossible.")
      }
    } catch {
      setError("Erreur réseau. Réessayez.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-brand-soft/40 px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="h-14 w-14" />
          <h1 className="text-2xl font-extrabold tracking-tight">Administration Téranga</h1>
          <p className="text-sm text-muted-foreground">Accès réservé à l'équipe de la boutique.</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border bg-card p-6 shadow-xl"
        >
          <div className="space-y-2">
            <Label htmlFor="email">Adresse email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="vous@teranga.market"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full bg-brand font-semibold text-brand-foreground hover:brightness-95">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Se connecter
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Espace privé sécurisé — chaque action est vérifiée et journalisée.
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/" className="font-medium hover:underline">← Retour à la boutique</Link>
        </p>
      </motion.div>
    </div>
  )
}
