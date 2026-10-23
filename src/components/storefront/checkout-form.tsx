"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  CreditCard,
  Gift,
  Loader2,
  Lock,
  LockKeyhole,
  MapPin,
  Package,
  ShieldCheck,
  Truck,
  UserPlus,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/storefront/empty-state"
import { useCartStore } from "@/lib/cart-store"
import { formatXOF } from "@/lib/money"
import { cn } from "@/lib/utils"

export interface CheckoutZone {
  id: string
  name: string
  baseCost: number
  estimatedDaysMin: number
  estimatedDaysMax: number
}

export interface CheckoutMethod {
  code: string
  name: string
  description: string | null
  instructions: string | null
  isOnline: boolean
  enabled: boolean
  needsConfig: boolean
}

export interface CheckoutUser {
  name: string
  email: string
  phone: string | null
  address: string | null
  city: string | null
  storeCredit: number
}

/** Panier serveur (GET /api/cart) — jamais recalculé côté navigateur. */
interface ClientCart {
  lines: {
    itemId: string
    quantity: number
    unitPrice: number
    lineTotal: number
    product: { id: string; name: string; slug: string; type: string; images: string[]; requiresShipping: boolean }
    variant: { id: string; name: string } | null
  }[]
  extraLines: { productName: string; quantity: number; message: string; productSlug: string; unitPrice: number }[]
  subtotal: number
  promotionDiscount: number
  couponDiscount: number
  coupon: { code: string; description: string; freeShipping: boolean; amount: number } | null
  promotions: { name: string; description: string; amount: number }[]
  notes: { level: string; message: string }[]
  itemCount: number
  savings: number
}

export function CheckoutForm({
  zones,
  methods,
  guestCheckoutEnabled,
  freeShippingThreshold,
  user,
}: {
  zones: CheckoutZone[]
  methods: CheckoutMethod[]
  guestCheckoutEnabled: boolean
  freeShippingThreshold: number
  user: CheckoutUser | null
}) {
  const router = useRouter()
  const [cart, setCart] = useState<ClientCart | null>(null)
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? "")
  const [methodCode, setMethodCode] = useState<string>(
    methods.find((m) => m.code === "cash_on_delivery")?.enabled ? "cash_on_delivery" : (methods.find((m) => m.enabled)?.code ?? ""),
  )
  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [phone, setPhone] = useState(user?.phone ?? "")
  const [address, setAddress] = useState(user?.address ?? "")
  const [city, setCity] = useState(user?.city ?? "")
  const [deliveryNote, setDeliveryNote] = useState("")
  const [createAccount, setCreateAccount] = useState(false)
  const [password, setPassword] = useState("")
  const [useCredit, setUseCredit] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const loadCart = useCallback(async () => {
    try {
      const res = await fetch("/api/cart", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) setCart(json.data as ClientCart)
    } catch {
      toast.error("Impossible de charger votre panier. Rechargez la page.")
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/cart", { cache: "no-store" })
        const json = await res.json()
        if (!cancelled && json.ok) setCart(json.data as ClientCart)
      } catch {
        toast.error("Impossible de charger votre panier. Rechargez la page.")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedZone = zones.find((z) => z.id === zoneId) ?? null
  const selectedMethod = methods.find((m) => m.code === methodCode) ?? null

  const needsShipping = cart?.lines.some((l) => l.product.requiresShipping) ?? false

  /**
   * Aperçu du coût de livraison : règle identique au serveur (orders.ts) —
   * zone sélectionnée, coupon FREE_SHIPPING, seuil de livraison offerte.
   * Le montant DÉFINITIF est de toute façon recalculé serveur au checkout.
   */
  const shippingEstimate = useMemo(() => {
    if (!needsShipping || !selectedZone) return 0
    if (cart?.coupon?.freeShipping) return 0
    const subtotalAfter = Math.max(0, (cart?.subtotal ?? 0) - (cart?.promotionDiscount ?? 0) - (cart?.couponDiscount ?? 0))
    if (freeShippingThreshold > 0 && subtotalAfter >= freeShippingThreshold) return 0
    return selectedZone.baseCost
  }, [needsShipping, selectedZone, cart, freeShippingThreshold])

  const subtotalAfter = Math.max(0, (cart?.subtotal ?? 0) - (cart?.promotionDiscount ?? 0) - (cart?.couponDiscount ?? 0))
  const preCreditTotal = subtotalAfter + shippingEstimate
  const creditUsed = useCredit && user ? Math.min(user.storeCredit, preCreditTotal) : 0
  const totalEstimate = Math.max(0, preCreditTotal - creditUsed)

  const loginRequired = !user && !guestCheckoutEnabled
  const canSubmit =
    !!cart && cart.lines.length > 0 && !!zoneId && !!methodCode && !loginRequired && !submitting

  async function changeZone(id: string) {
    setZoneId(id)
    // Le panier est recalculé côté serveur à chaque changement de zone
    await loadCart()
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (name.trim().length < 2) errs.name = "Indiquez votre nom complet."
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Adresse email invalide."
    if (phone.trim().length < 6) errs.phone = "Numéro de téléphone requis."
    if (address.trim().length < 4) errs.address = "Adresse de livraison requise."
    if (city.trim().length < 2) errs.city = "Ville requise."
    if (!zoneId) errs.zoneId = "Choisissez une zone de livraison."
    if (!methodCode) errs.methodCode = "Choisissez un moyen de paiement."
    if (!user && guestCheckoutEnabled && createAccount && password.length < 8) {
      errs.password = "Mot de passe : 8 caractères minimum."
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      toast.error("Veuillez corriger les champs signalés.")
      return false
    }
    return true
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit || !validate()) return
    setSubmitting(true)

    try {
      // Étape 1 : création de compte optionnelle (invité avec compte)
      if (!user && guestCheckoutEnabled && createAccount) {
        const regRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            phone: phone.trim(),
          }),
        })
        const regJson = await regRes.json()
        if (!regJson.ok) {
          toast.error(regJson.error ?? "Impossible de créer votre compte.")
          setSubmitting(false)
          return
        }
      }

      // Étape 2 : création de la commande (totaux 100% serveur)
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim(),
          customerEmail: email.trim().toLowerCase(),
          customerPhone: phone.trim(),
          address: address.trim(),
          city: city.trim(),
          shippingZoneId: zoneId,
          paymentMethodCode: methodCode,
          deliveryNote: deliveryNote.trim() || undefined,
          useCredit: useCredit || undefined,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        toast.error(json.error ?? "La commande n'a pas pu être créée.")
        // Stock/coupon potentiellement modifiés → rafraîchir le panier serveur
        await loadCart()
        useCartStore.getState().fetchCart()
        setSubmitting(false)
        return
      }

      const { confirmationUrl } = json.data as { confirmationUrl: string }
      useCartStore.getState().fetchCart() // remet à jour le badge panier
      router.push(confirmationUrl)
    } catch {
      toast.error("Erreur réseau. Réessayez.")
      setSubmitting(false)
    }
  }

  if (!cart) {
    return (
      <div aria-busy="true" aria-label="Chargement du paiement">
        <Skeleton className="mb-6 h-9 w-64" />
        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          <div className="space-y-4">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    )
  }

  if (cart.lines.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Finaliser ma commande</h1>
        <EmptyState
          icon={Package}
          title="Votre panier est vide"
          description="Ajoutez des articles à votre panier avant de passer commande."
          action={
            <Button asChild className="bg-brand text-brand-foreground hover:brightness-95">
              <Link href="/catalogue">Aller au catalogue</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Finaliser ma commande</h1>
          <p className="text-sm text-muted-foreground">
            {user ? (
              <span className="inline-flex items-center gap-1">
                <BadgeCheck className="h-4 w-4 text-emerald-600" /> Connecté en tant que {user.name}
              </span>
            ) : (
              "Commande en tant que visiteur"
            )}
          </p>
        </div>
      </header>

      {loginRequired && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-5 w-5 shrink-0" />
            La commande sans compte est désactivée : une connexion est requise.
          </p>
          <Button asChild size="sm" className="bg-brand text-brand-foreground hover:brightness-95">
            <Link href="/login?next=/checkout">Se connecter</Link>
          </Button>
        </div>
      )}

      {cart.notes.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
          {cart.notes.map((n, i) => (
            <p key={i} className="text-xs text-amber-800 dark:text-amber-300">
              ⚠ {n.message}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_400px] lg:gap-6">
        <div className="space-y-4">
          {/* ---------- Coordonnées ---------- */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                Vos coordonnées
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!user && guestCheckoutEnabled && (
                <div className="flex items-start gap-3 rounded-lg border bg-brand-soft/50 p-3">
                  <UserPlus className="mt-0.5 h-4 w-4 text-brand-foreground" />
                  <div className="flex-1">
                    <label htmlFor="create-account" className="cursor-pointer text-sm font-medium">
                      Créer un compte (recommandé)
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Suivi de commande, fichiers numériques, parrainage — votre email servira d&apos;identifiant.
                    </p>
                  </div>
                  <Switch
                    id="create-account"
                    checked={createAccount}
                    onCheckedChange={setCreateAccount}
                    aria-label="Créer un compte"
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="co-name">Nom complet *</Label>
                  <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!errors.name} />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="co-email">Email *</Label>
                  <Input
                    id="co-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="co-phone">Téléphone *</Label>
                  <Input
                    id="co-phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    placeholder="+225 07 00 00 00 00"
                    aria-invalid={!!errors.phone}
                  />
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                  <p className="text-xs text-muted-foreground">Le livreur vous appelle à ce numéro.</p>
                </div>
                {createAccount && !user && (
                  <div className="space-y-1.5">
                    <Label htmlFor="co-password" className="flex items-center gap-1.5">
                      <LockKeyhole className="h-3.5 w-3.5" /> Mot de passe (8 caractères min.) *
                    </Label>
                    <Input
                      id="co-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      aria-invalid={!!errors.password}
                    />
                    {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ---------- Livraison ---------- */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                Adresse de livraison
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="co-address">Adresse précise *</Label>
                <Input
                  id="co-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  autoComplete="street-address"
                  placeholder="Quartier, rue, porte, repère…"
                  aria-invalid={!!errors.address}
                />
                {errors.address && <p className="text-xs text-destructive">{errors.address}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-city">Ville *</Label>
                <Input
                  id="co-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  autoComplete="address-level2"
                  aria-invalid={!!errors.city}
                />
                {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Zone de livraison *</legend>
                {errors.zoneId && <p className="text-xs text-destructive">{errors.zoneId}</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  {zones.map((zone) => {
                    const selected = zone.id === zoneId
                    return (
                      <button
                        key={zone.id}
                        type="button"
                        onClick={() => changeZone(zone.id)}
                        aria-pressed={selected}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition",
                          selected
                            ? "border-brand bg-brand-soft/70 shadow-sm"
                            : "bg-card hover:border-foreground/30 hover:bg-secondary/60",
                        )}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="text-sm font-semibold leading-snug">{zone.name}</span>
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                              selected ? "border-brand bg-brand" : "border-muted-foreground/40",
                            )}
                            aria-hidden
                          >
                            {selected && <CheckCircle2 className="h-3.5 w-3.5 text-brand-foreground" />}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Livraison estimée : {zone.estimatedDaysMin}–{zone.estimatedDaysMax} jours
                        </span>
                        <span className="text-sm font-bold text-brand-foreground">{formatXOF(zone.baseCost)}</span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor="co-note" className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Note de livraison (optionnel)
                </Label>
                <Textarea
                  id="co-note"
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  placeholder="Ex : appeler avant d'arriver, livrer au gardien…"
                  rows={2}
                  maxLength={500}
                />
              </div>
            </CardContent>
          </Card>

          {/* ---------- Paiement ---------- */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                Moyen de paiement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="sr-only">Choisissez votre moyen de paiement</legend>
                {methods.map((method) => {
                  const selected = method.code === methodCode
                  const disabled = !method.enabled
                  return (
                    <button
                      key={method.code}
                      type="button"
                      disabled={disabled}
                      onClick={() => setMethodCode(method.code)}
                      aria-pressed={selected}
                      title={disabled ? "Bientôt disponible — configuration requise" : undefined}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition",
                        selected ? "border-brand bg-brand-soft/70 shadow-sm" : "bg-card hover:bg-secondary/60",
                        disabled && "cursor-not-allowed opacity-55 hover:bg-card",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          selected ? "border-brand bg-brand" : "border-muted-foreground/40",
                        )}
                        aria-hidden
                      >
                        {selected && <CheckCircle2 className="h-3.5 w-3.5 text-brand-foreground" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-semibold">{method.name}</span>
                          {method.isOnline && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                              <Lock className="h-3 w-3" /> À configurer
                            </span>
                          )}
                          {method.code === "cash_on_delivery" && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                              <BadgeCheck className="h-3 w-3" /> Recommandé
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {disabled
                            ? "Bientôt disponible — configuration requise."
                            : (method.description ?? method.instructions ?? "")}
                        </span>
                      </span>
                      {method.isOnline ? <CreditCard className="h-5 w-5 shrink-0 text-muted-foreground" /> : <Banknote className="h-5 w-5 shrink-0 text-muted-foreground" />}
                    </button>
                  )
                })}
                {errors.methodCode && <p className="text-xs text-destructive">{errors.methodCode}</p>}
              </fieldset>

              {selectedMethod?.instructions && selectedMethod.enabled && (
                <p className="rounded-lg bg-brand-soft px-3.5 py-3 text-sm leading-relaxed text-brand-foreground">
                  💡 {selectedMethod.instructions}
                </p>
              )}

              {/* Crédit boutique */}
              {user && user.storeCredit > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div className="flex-1">
                    <label htmlFor="use-credit" className="cursor-pointer text-sm font-semibold">
                      Utiliser mon crédit boutique ({formatXOF(user.storeCredit)})
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Appliqué en totalité, dans la limite du montant de la commande
                      {creditUsed > 0 ? ` : ici ${formatXOF(creditUsed)}.` : "."}
                    </p>
                  </div>
                  <Switch id="use-credit" checked={useCredit} onCheckedChange={setUseCredit} aria-label="Utiliser mon crédit boutique" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---------- Récapitulatif sticky ---------- */}
        <div className="lg:sticky lg:top-24 lg:h-fit">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Votre commande</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="scrollbar-thin max-h-72 space-y-2.5 overflow-y-auto pr-1">
                {cart.lines.map((line) => (
                  <li key={line.itemId} className="flex items-center gap-2.5">
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-secondary/40">
                      {line.product.images?.[0] && (
                        <Image src={line.product.images[0]} alt="" fill sizes="44px" className="object-cover" />
                      )}
                      <span className="absolute -right-0 -top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold text-background">
                        {line.quantity}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/products/${line.product.slug}`} className="line-clamp-1 text-xs font-medium hover:underline">
                        {line.product.name}
                      </Link>
                      {line.variant && <span className="block text-[11px] text-muted-foreground">{line.variant.name}</span>}
                    </span>
                    <span className="text-xs font-bold tabular-nums">{formatXOF(line.lineTotal)}</span>
                  </li>
                ))}
                {cart.extraLines.map((extra, i) => (
                  <li key={`extra-${i}`} className="flex items-center gap-2.5 rounded-md border border-dashed border-emerald-300 bg-emerald-50/60 px-2 py-1.5 dark:border-emerald-800 dark:bg-emerald-950/30">
                    <Gift className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="min-w-0 flex-1 text-xs font-medium text-emerald-800 dark:text-emerald-300">{extra.productName}</span>
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Offert</span>
                  </li>
                ))}
              </ul>

              {cart.promotions.length > 0 && (
                <div className="rounded-lg bg-emerald-50/70 px-3 py-2.5 dark:bg-emerald-950/30">
                  {cart.promotions.map((p, i) => (
                    <p key={i} className="text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-400">
                      🎁 {p.description}
                    </p>
                  ))}
                </div>
              )}

              <Separator />

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Sous-total</span>
                  <span>{formatXOF(cart.subtotal)}</span>
                </div>
                {cart.promotionDiscount > 0 && (
                  <div className="flex justify-between font-medium text-emerald-600">
                    <span>Promotions</span>
                    <span>-{formatXOF(cart.promotionDiscount)}</span>
                  </div>
                )}
                {cart.couponDiscount > 0 && cart.coupon && (
                  <div className="flex justify-between font-medium text-emerald-600">
                    <span>Code {cart.coupon.code}</span>
                    <span>-{formatXOF(cart.couponDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Truck className="h-4 w-4" /> Livraison (estimée)
                  </span>
                  <span>{shippingEstimate === 0 ? "Offerte" : formatXOF(shippingEstimate)}</span>
                </div>
                {creditUsed > 0 && (
                  <div className="flex justify-between font-medium text-emerald-600">
                    <span>Crédit boutique</span>
                    <span>-{formatXOF(creditUsed)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-base font-extrabold">
                  <span>Total estimé</span>
                  <span>{formatXOF(totalEstimate)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Montant final confirmé par nos serveurs au moment de la commande.</p>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={!canSubmit}
                className="w-full gap-2 bg-brand text-base font-extrabold text-brand-foreground shadow-md hover:brightness-95"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Commande en cours…
                  </>
                ) : (
                  <>
                    Confirmer la commande <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </Button>
              {loginRequired && (
                <p className="text-center text-xs text-muted-foreground">
                  <Link href="/login?next=/checkout" className="font-semibold text-brand-foreground underline underline-offset-2">
                    Connectez-vous
                  </Link>{" "}
                  pour commander.
                </p>
              )}
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Aucun paiement en ligne n&apos;est requis pour le paiement à la livraison.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
