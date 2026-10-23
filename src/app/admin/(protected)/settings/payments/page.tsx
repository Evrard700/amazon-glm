"use client"

import { useEffect, useState } from "react"
import { CreditCard, Loader2, ShieldCheck, Copy } from "lucide-react"
import { toast } from "sonner"
import { AdminPageHeader } from "@/components/admin/page-header"
import { useAdminApi } from "@/components/admin/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface PaymentMethodData {
  id: string
  code: string
  name: string
  description: string | null
  instructions: string | null
  isOnline: boolean
  isActive: boolean
  position: number
  configKeys: string[]
  configMasked: Record<string, { masked: string; configured: boolean }>
  fullyConfigured: boolean
}

export default function AdminPaymentsSettingsPage() {
  const api = useAdminApi()
  const [methods, setMethods] = useState<PaymentMethodData[] | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [keyDrafts, setKeyDrafts] = useState<Record<string, Record<string, string>>>({})

  async function load() {
    const data = await api.get<PaymentMethodData[]>("/api/admin/settings/payments")
    if (data) setMethods(data)
  }

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [api])

  async function saveMethod(m: PaymentMethodData, patch: Record<string, unknown>) {
    setSavingId(m.id)
    const data = await api.patch(`/api/admin/settings/payments?id=${m.id}`, patch)
    setSavingId(null)
    if (data) {
      await load()
      toast.success(`« ${m.name} » mis à jour.`)
    }
  }

  if (!methods) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-secondary" />
        <div className="h-96 animate-pulse rounded-xl bg-secondary" />
      </div>
    )
  }

  return (
    <div>
      <AdminPageHeader
        title="Moyens de paiement"
        description="Activez les fournisseurs réels après avoir configuré leurs clés serveur — aucune simulation de paiement n'est possible."
      />

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          <strong>Intégrations réelles uniquement.</strong> Sans clés API valides, un fournisseur en ligne ne peut être activé et aucun
          paiement ne sera traité. Les webhooks sont vérifiés (signature HMAC) et idempotents : URL à configurer chez le fournisseur =
          <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/60">/api/webhooks/payments/&lt;code&gt;</code>
          <Copy className="ml-1 inline h-3 w-3" />
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {methods.map((m) => (
          <Card key={m.id} className={m.isActive ? "border-emerald-200 dark:border-emerald-900" : ""}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CreditCard className="h-4 w-4 text-brand-foreground" />
                    <p className="font-semibold">{m.name}</p>
                    <code className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{m.code}</code>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {m.isOnline && (
                    <Badge variant={m.fullyConfigured ? "secondary" : "outline"} className={m.fullyConfigured ? "text-emerald-700" : "text-amber-700"}>
                      {m.fullyConfigured ? "Configuré" : "À configurer"}
                    </Badge>
                  )}
                  <Switch
                    checked={m.isActive}
                    disabled={savingId === m.id || (m.isOnline && !m.fullyConfigured && m.isActive === false)}
                    onCheckedChange={(v) => saveMethod(m, { isActive: v })}
                  />
                </div>
              </div>

              {m.isOnline && (
                <div className="space-y-2 rounded-lg border bg-secondary/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clés serveur (jamais exposées au navigateur)</p>
                  {(m.configKeys.length > 0 ? m.configKeys : ["apiKey", "merchantId", "webhookSecret"]).map((key) => (
                    <div key={key} className="grid grid-cols-[140px_1fr] items-center gap-2">
                      <Label htmlFor={`${m.id}-${key}`} className="font-mono text-xs">
                        {key}
                      </Label>
                      <Input
                        id={`${m.id}-${key}`}
                        type="password"
                        placeholder={m.configMasked[key]?.configured ? m.configMasked[key].masked : "non renseigné"}
                        value={keyDrafts[m.id]?.[key] ?? ""}
                        onChange={(e) =>
                          setKeyDrafts((d) => ({ ...d, [m.id]: { ...(d[m.id] ?? {}), [key]: e.target.value } }))
                        }
                        className="h-8 font-mono text-xs"
                      />
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={savingId === m.id}
                      onClick={() => {
                        const drafts = keyDrafts[m.id] ?? {}
                        const filled = Object.fromEntries(Object.entries(drafts).filter(([, v]) => v.length > 3))
                        if (Object.keys(filled).length === 0) {
                          toast.info("Renseignez au moins une clé (4 caractères min.) pour enregistrer la configuration.")
                          return
                        }
                        saveMethod(m, { config: filled })
                        setKeyDrafts((d) => ({ ...d, [m.id]: {} }))
                      }}
                    >
                      {savingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Enregistrer les clés
                    </Button>
                  </div>
                  {!m.fullyConfigured && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Tant qu'aucune clé n'est enregistrée, ce fournisseur reste inactif — les clients continuent de payer à la livraison sans interruption.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`instr-${m.id}`} className="text-xs">
                  Instructions affichées au client
                </Label>
                <Textarea
                  id={`instr-${m.id}`}
                  rows={2}
                  className="text-sm"
                  defaultValue={m.instructions ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (m.instructions ?? "")) saveMethod(m, { instructions: e.target.value })
                  }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
