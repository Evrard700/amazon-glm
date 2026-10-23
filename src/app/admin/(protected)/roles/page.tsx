"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Check, Loader2, Lock, Minus, RotateCcw, Save, ShieldCheck, UserCog } from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { RoleBadge } from "@/components/admin/shared/badges"
import { permissionLabel } from "@/components/admin/shared/permission-labels"
import { useAdminApi } from "@/components/admin/api-client"
import { useMe } from "@/components/admin/shared/use-me"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface RoleMatrix {
  role: string
  label: string
  editable: boolean
  isOwner: boolean
  permissions: string[]
  defaults: string[]
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  OWNER: "Accès complet et verrouillé, inclut la gestion des utilisateurs. Compte initial insupprimable.",
  ADMIN: "Toutes les permissions sauf la gestion des utilisateurs (personnalisable).",
  MANAGER: "Opérations : commandes, produits, stock, clients, paiements, remboursements, statistiques.",
  MARKETING: "Coupons, promotions, parrainage, upsells, campagnes, avis, pages vitrine et thème.",
  STAFF: "Lecture du catalogue et des commandes, gestion du stock, modération des avis.",
}

export default function AdminRolesPage() {
  const api = useAdminApi()
  const { me } = useMe()
  const [roles, setRoles] = useState<RoleMatrix[]>([])
  const [allPermissions, setAllPermissions] = useState<string[]>([])
  const [draft, setDraft] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [savingRole, setSavingRole] = useState<string | null>(null)

  const isOwner = me?.role === "OWNER"

  const load = useCallback(async () => {
    setLoading(true)
    const data = await api.get<{ roles: RoleMatrix[]; allPermissions: string[] }>("/api/admin/roles")
    if (data) {
      setRoles(data.roles)
      setAllPermissions(data.allPermissions)
      setDraft(Object.fromEntries(data.roles.map((r) => [r.role, [...r.permissions]])))
    }
    setLoading(false)
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const dirty = (role: string) => {
    const effective = roles.find((r) => r.role === role)
    if (!effective) return false
    const a = [...(draft[role] ?? [])].sort()
    const b = [...effective.permissions].sort()
    return a.length !== b.length || a.some((v, i) => v !== b[i])
  }

  function togglePerm(role: string, perm: string) {
    setDraft((prev) => {
      const current = prev[role] ?? []
      const next = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm]
      // users.manage ne peut jamais être accordé à un rôle non-propriétaire.
      return { ...prev, [role]: next.filter((p) => p !== "users.manage") }
    })
  }

  function setAll(role: string, perms: string[]) {
    setDraft((prev) => ({ ...prev, [role]: perms.filter((p) => p !== "users.manage") }))
  }

  async function saveRole(role: string) {
    setSavingRole(role)
    const result = await api.put<{ role: string; permissions: string[] }>("/api/admin/roles", {
      role,
      permissions: draft[role] ?? [],
    })
    setSavingRole(null)
    if (result) {
      toast.success(`Permissions « ${role} » enregistrées — appliquées immédiatement côté serveur.`)
      await load()
    }
  }

  async function resetRole(role: string) {
    setSavingRole(role)
    const result = await api.delBody<{ role: string; permissions: string[] }>("/api/admin/roles", { role })
    setSavingRole(null)
    if (result) {
      toast.success(`Rôle « ${role} » réinitialisé sur ses permissions par défaut.`)
      await load()
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <AdminPageHeader
        title="Rôles & permissions"
        description={
          isOwner
            ? "Contrôle total : cochez précisément ce que chaque rôle peut faire. Chaque changement est appliqué immédiatement côté serveur et journalisé."
            : "La matrice des droits de l'équipe, telle qu'elle est appliquée côté serveur. Seul le Propriétaire peut la modifier."
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-xl border bg-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Matrice des permissions</CardTitle>
            <p className="text-xs text-muted-foreground">
              Source de vérité : le serveur vérifie ces droits à CHAQUE appel API (requireStaff).
              {isOwner && " Vos modifications priment sur les valeurs par défaut."}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-secondary">
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Permission</th>
                      {roles.map((r) => (
                        <th key={r.role} className="px-2 py-2 text-center font-medium">
                          <span className="whitespace-nowrap">{r.label}</span>
                          {r.isOwner && <Lock className="ml-1 inline h-3 w-3 text-muted-foreground" aria-label="Verrouillé" />}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allPermissions.map((permission) => (
                      <tr key={permission} className="border-t">
                        <td className="px-3 py-1.5">
                          <p className="text-sm">{permissionLabel(permission)}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">{permission}</p>
                        </td>
                        {roles.map((r) => {
                          const granted = (draft[r.role] ?? r.permissions).includes(permission)
                          const locked = r.isOwner || !isOwner || permission === "users.manage"
                          if (r.isOwner) {
                            return (
                              <td key={r.role} className="px-2 py-1.5 text-center">
                                {granted ? (
                                  <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Toujours autorisé" />
                                ) : (
                                  <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="Refusé" />
                                )}
                              </td>
                            )
                          }
                          return (
                            <td key={r.role} className="px-2 py-1.5 text-center">
                              <Checkbox
                                aria-label={`${permissionLabel(permission)} pour ${r.label}`}
                                checked={granted}
                                disabled={locked}
                                onCheckedChange={() => togglePerm(r.role, permission)}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {isOwner && (
            <Card className="rounded-xl border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-base">
                  <UserCog className="h-4 w-4 text-brand-foreground" /> Enregistrer par rôle
                </CardTitle>
                <p className="text-xs text-muted-foreground">Modifications en attente, rôle par rôle.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {roles
                  .filter((r) => r.editable)
                  .map((r) => {
                    const count = (draft[r.role] ?? []).length
                    const isDirty = dirty(r.role)
                    return (
                      <div key={r.role} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.label}</p>
                          <p className="text-xs text-muted-foreground">{count} permission(s)</p>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Tout accorder à ${r.label}`}
                          title="Tout accorder"
                          onClick={() => setAll(r.role, allPermissions)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Réinitialiser ${r.label}`}
                          title="Retour aux défauts (serveur)"
                          disabled={savingRole === r.role}
                          onClick={() => resetRole(r.role)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 gap-1"
                          disabled={savingRole === r.role || !isDirty}
                          onClick={() => saveRole(r.role)}
                        >
                          {savingRole === r.role ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {isDirty ? "Enregistrer" : "À jour"}
                        </Button>
                      </div>
                    )
                  })}
              </CardContent>
            </Card>
          )}

          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Comment ça marche ?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Chaque route de l'API admin appelle
                <code className="mx-1 rounded bg-secondary px-1 text-xs">requireStaff(permission)</code> qui recharge
                votre rôle depuis la base et vérifie la permission <strong className="text-foreground">à chaque requête</strong>.
              </p>
              <p>
                Le menu de la console n'affiche que les pages permises — mais l'affichage est purement cosmétique :
                c'est bien le serveur qui refuse (401/403) toute action non autorisée.
              </p>
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                <strong>Verrous de sécurité :</strong> le rôle Propriétaire garde toujours tous les droits et ne peut
                pas être modifié ; la permission « Gérer les utilisateurs » ne peut être accordée à aucun autre rôle.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rôles de l'équipe</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              {roles.map((r) => (
                <div key={r.role} className="flex items-start gap-2">
                  <RoleBadge role={r.role} />
                  <p className="flex-1 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r.role]}</p>
                </div>
              ))}
              <div className="flex items-start gap-2 border-t pt-2.5">
                <Badge variant="outline" className="border bg-secondary text-xs">Client</Badge>
                <p className="flex-1 text-xs text-muted-foreground">
                  Aucun accès à la console. Les permissions ci-dessus ne s'appliquent qu'à l'équipe.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
