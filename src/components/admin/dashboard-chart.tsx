"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatDayShort } from "@/components/admin/shared/format"
import { formatXOF } from "@/lib/money"

// ============================================================
// Graphique « CA payé par jour » du tableau de bord.
// Composant isolé et chargé à la demande (next/dynamic dans la
// page) : recharts (~100 Ko gzippé) n'alourdit pas le premier
// chargement de la console — il arrive pendant l'affichage des
// KPI, sa place étant occupée par un squelette de même hauteur.
// ============================================================

export function RevenueChart({ data }: { data: { day: string; amount: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="caGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={(v: string) => formatDayShort(v)}
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
          minTickGap={24}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          formatter={(value) => [formatXOF(Number(value)), "CA payé"]}
          labelFormatter={(label) => formatDayShort(label)}
          contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
        />
        <Area type="monotone" dataKey="amount" stroke="#d97706" strokeWidth={2} fill="url(#caGradient)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
