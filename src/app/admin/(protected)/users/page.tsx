"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { KeyRound, Loader2, MoreHorizontal, ShieldOff, UserCheck, UserPlus, UserRound } from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { useAdminApi } from "@/components/admin/api-client"
import { useMe } from "@/components/admin/shared/use-me"
import { RoleBadge } from "@/components/admin/shared/badges"
import { formatDate, formatRelative } from "@/components/admin/shared/format"
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/constants"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface StaffUser {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  isSelf: boolean
}

const INVITABLE_ROLES = ["ADMIN", "MANAGER", "MARKETING", "STAFF"] as const

export default function AdminUsersPage() {
  const api = useAdminApi()
  const { me } = useMe()
  const [users, setUsers] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invite, setInvite] = useState({ name: "", email: "", role: "STAFF", password: "" })
  const [saving, setSaving] = useState(false)
  const [pwdTarget, setPwdTarget] = useState<StaffUser | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<StaffUser | null>(null)
  const [acting, setActing] = useState(false)

  const isOwner = me?.role === "OWNER"

  const load = useCallback(async () => {
    setLoading(true)
    const data = await api.get<{ actorRole: string; users: StaffUser[] }>("/api/admin/users")
    if (data) setUsers(data.users)
    setLoading(false)
     
  }, [api])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  async function onInvite() {
    if (invite.name.trim().length < 2 || !invite.email.includes("@") || invite.password.length < 8) {
      toast.error("Vérifiez le nom, l'email et le mot de passe (8 caractères minimum).")
      return
    }
    setSaving(true)
    const result = await api.post<{ id: string }>("/api/admin/users", {
      name: invite.name.trim(),
      email: invite.email.trim(),
      role: invite.role,
      password: invite.password,
    })
    setSaving(false)
    if (result) {
      toast.success(`Invitation créée : ${invite.email} peut se connecter avec ce mot de passe.`)
      setInviteOpen(false)
      setInvite({ name: "", email: "", role: "STAFF", password: "" })
      load()
    }
  }

  async function onPatch(user: StaffUser, body: Record<string, unknown>, msg: string) {
    const result = await api.patch<{ id: string }>(`/api/admin/users/${user.id}`, body)
    if (result !== null) {
      toast.success(msg)
      load()
    }
  }

  async function onResetPassword() {
    if (!pwdTarget) return
    if (newPassword.length < 8) {
      toast.error("Le mot de passe doit contenir au moins 8 caractères.")
      return
    }
    setActing(true)
    const result = await api.patch<{ id: string }>(`/api/admin/users/${pwdTarget.id}`, { password: newPassword })
    setActing(false)
    if (result !== null) {
      toast.success(`Mot de passe de ${pwdTarget.name} réinitialisé. Communiquez-le de façon sécurisée.`)
      setPwdTarget(null)
      setNewPassword("")
    }
  }

  async function onDeleteMember() {
    if (!deleteTarget) return
    setActing(true)
    const result = await api.del<{ id: string; message: string }>(`/api/admin/users/${deleteTarget.id}`)
    setActing(false)
    if (result !== null) {
      toast.success(result.message ?? "Membre supprimé.")
      setDeleteTarget(null)
      load()
    }
  }

  const columns: ColumnDef<StaffUser, unknown>[] = [
    {
      accessorKey: "name",
      header: "Membre",
      cell: ({ row }) => {
        const u = row.original
        return (
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold uppercase text-primary-foreground">
              {u.name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {u.name} {u.isSelf && <span className="text-xs text-muted-foreground">(vous)</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "role",
      header: "Rôle",
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
    },
    {
      accessorKey: "isActive",
      header: "Statut",
      cell: ({ row }) => {
        const u = row.original
        return u.isActive ? (
          <Badge variant="outline" className="border border-emerald-200 bg-emerald-50 text-emerald-800">
            <UserCheck className="mr-1 h-3 w-3" /> Actif
          </Badge>
        ) : (
          <Badge variant="outline" className="border border-rose-200 bg-rose-50 text-rose-700">
            <ShieldOff className="mr-1 h-3 w-3" /> Désactivé
          </Badge>
        )
      },
    },
    {
      accessorKey: "lastLoginAt",
      header: "Dernière connexion",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs">{row.original.lastLoginAt ? formatRelative(row.original.lastLoginAt) : "Jamais"}</span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Ajouté le",
      cell: ({ row }) => <span className="whitespace-nowrap text-xs">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const u = row.original
        if (!isOwner || u.role === "OWNER") {
          return me === null ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/roles">Matrice</Link>
            </Button>
          )
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Actions membre">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Changer le rôle</DropdownMenuLabel>
              {INVITABLE_ROLES.map((role) => (
                <DropdownMenuItem key={role} disabled={role === u.role} onClick={() => onPatch(u, { role }, `Rôle modifié en « ${ROLE_LABELS[role]} ».`)}>
                  {ROLE_LABELS[role]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setPwdTarget(u); setNewPassword("") }}>
                <KeyRound className="h-4 w-4" /> Réinitialiser le mot de passe
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPatch(u, { isActive: !u.isActive }, u.isActive ? "Membre désactivé." : "Membre réactivé.")}>
                {u.isActive ? "Désactiver le compte" : "Réactiver le compte"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-rose-600" onClick={() => setDeleteTarget(u)}>
                Supprimer définitivement le membre
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <div className="p-4 sm:p-6">
      <AdminPageHeader
        title="Utilisateurs"
        description="Membres de l'équipe ayant accès à la console d'administration."
        actions={
          isOwner ? (
            <Button onClick={() => setInviteOpen(true)} className="gap-1.5">
              <UserPlus className="h-4 w-4" /> Inviter un membre
            </Button>
          ) : (
            <Badge variant="outline" className="border bg-amber-50 text-amber-800">
              Seul le compte Propriétaire gère les membres
            </Badge>
          )
        }
      />

      {me && !isOwner && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          La gestion des utilisateurs est réservée au compte Propriétaire. Vous pouvez consulter la liste et la matrice des rôles.
        </p>
      )}

      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        searchPlaceholder="Rechercher (nom, email)…"
        emptyMessage="Aucun membre du staff."
        pageSize={10}
      />

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inviter un membre</DialogTitle>
            <DialogDescription>
              Le membre pourra se connecter immédiatement à /admin/login avec ce mot de passe. Communiquez-le-lui de façon sécurisée.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Nom complet *</Label>
              <Input id="invite-name" value={invite.name} onChange={(e) => setInvite((v) => ({ ...v, name: e.target.value }))} placeholder="Ex : Mariam Bamba" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email *</Label>
              <Input id="invite-email" type="email" value={invite.email} onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))} placeholder="mariam@teranga.market" />
            </div>
            <div className="space-y-1.5">
              <Label>Rôle *</Label>
              <Select value={invite.role} onValueChange={(v) => setInvite((s) => ({ ...s, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVITABLE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                La matrice des permissions est vérifiée côté serveur à chaque appel API — consultez la page Rôles.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-password">Mot de passe initial * (8 caractères min.)</Label>
              <Input id="invite-password" type="text" value={invite.password} onChange={(e) => setInvite((v) => ({ ...v, password: e.target.value }))} placeholder="8 caractères minimum" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Annuler</Button>
            <Button onClick={onInvite} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Créer le compte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleteTarget?.name} » définitivement ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le compte ({deleteTarget?.email}) et ses accès seront supprimés pour toujours. Ses notes internes seront
              réattribuées au Propriétaire ; l'historique d'activité est conservé. Cette action est journalisée et irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={acting}
              onClick={onDeleteMember}
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={pwdTarget !== null} onOpenChange={(o) => !o && setPwdTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe de {pwdTarget?.name}</DialogTitle>
            <DialogDescription>
              Définissez un mot de passe temporaire (8 caractères minimum) et communiquez-le au membre de façon sécurisée.
              Il pourra ensuite se connecter à /admin/login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-pwd">Nouveau mot de passe *</Label>
            <Input id="new-pwd" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="8 caractères minimum" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdTarget(null)}>Annuler</Button>
            <Button onClick={onResetPassword} disabled={acting || newPassword.length < 8} className="gap-1.5">
              {acting && <Loader2 className="h-4 w-4 animate-spin" />}
              Réinitialiser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
