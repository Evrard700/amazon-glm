"use client"

import { useEffect, useState } from "react"
import { Activity, ChevronLeft, ChevronRight } from "lucide-react"
import { AdminPageHeader } from "@/components/admin/page-header"
import { useAdminApi } from "@/components/admin/api-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ROLE_LABELS } from "@/lib/constants"

interface LogRow {
  id: string
  actorName: string
  actorRole: string | null
  action: string
  entityType: string | null
  entityId: string | null
  details: Record<string, unknown>
  createdAt: string
}

const ACTION_COLORS: Record<string, string> = {}
function actionColor(action: string): string {
  if (action.startsWith("order.confirm") || action.includes("payment")) return "bg-emerald-100 text-emerald-800 border-emerald-200"
  if (action.startsWith("order.cancel") || action.includes("refund") || action.includes("reject")) return "bg-rose-100 text-rose-700 border-rose-200"
  if (action.startsWith("product") || action.includes("inventory")) return "bg-violet-100 text-violet-800 border-violet-200"
  if (action.includes("coupon") || action.includes("promo") || action.includes("reward") || action.includes("upsell")) return "bg-brand-soft text-brand-foreground border-brand/30"
  if (action.startsWith("auth")) return "bg-sky-100 text-sky-800 border-sky-200"
  return "bg-secondary text-foreground/80"
}

export default function AdminActivityLogsPage() {
  const api = useAdminApi()
  const [items, setItems] = useState<LogRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState("")
  const [actorFilter, setActorFilter] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const pageSize = 25

  async function load(p = page) {
    const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
    if (actionFilter) params.set("action", actionFilter)
    if (actorFilter) params.set("actor", actorFilter)
    const data = await api.get<{ items: LogRow[]; total: number }>(`/api/admin/activity?${params.toString()}`)
    if (data) {
      setItems(data.items)
      setTotal(data.total)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void load(page), 0)
    return () => clearTimeout(t)
  }, [page, api])

  return (
    <div>
      <AdminPageHeader
        title="Journal d'activité"
        description="Traçabilité complète : chaque action sensible est enregistrée avec son auteur (exigence de sécurité du cahier des charges)."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Filtrer par action (ex : order.confirm_payment)"
          className="h-9 max-w-72"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1)
              void load(1)
            }
          }}
        />
        <Input
          placeholder="Filtrer par auteur"
          className="h-9 max-w-48"
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(1)
              void load(1)
            }
          }}
        />
        <Button
          variant="outline"
          className="h-9"
          onClick={() => {
            setPage(1)
            void load(1)
          }}
        >
          Filtrer
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {!items ? (
          <div className="divide-y">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <div className="h-9 w-full animate-pulse rounded bg-secondary" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Aucune activité enregistrée pour ces filtres.</p>
        ) : (
          <ul className="divide-y">
            {items.map((log) => (
              <li key={log.id}>
                <button
                  className="flex w-full flex-wrap items-center gap-3 p-3 text-left transition hover:bg-secondary/40"
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                >
                  <span className="rounded-lg bg-secondary p-1.5 text-muted-foreground"><Activity className="h-4 w-4" /></span>
                  <Badge variant="outline" className={`border font-mono text-[11px] ${actionColor(log.action)}`}>
                    {log.action}
                  </Badge>
                  <span className="text-sm font-medium">{log.actorName}</span>
                  {log.actorRole && ROLE_LABELS[log.actorRole] && (
                    <span className="text-xs text-muted-foreground">({ROLE_LABELS[log.actorRole]})</span>
                  )}
                  {log.entityType && (
                    <span className="text-xs text-muted-foreground">
                      → {log.entityType}
                      {log.entityId ? ` #${log.entityId.slice(-6)}` : ""}
                    </span>
                  )}
                  <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </button>
                {expanded === log.id && (
                  <pre className="scrollbar-thin max-h-64 overflow-auto border-t bg-secondary/30 px-4 py-3 font-mono text-xs leading-relaxed">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <p>{total} événement(s)</p>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" /> Précédent
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={items ? page * pageSize >= total : true}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
