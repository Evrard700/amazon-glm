"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatXOF } from "@/lib/money"

// ============================================================
// Graphiques de la page « Statistiques avancées ».
// Composants isolés et chargés à la demande (next/dynamic) :
// recharts (~100 Ko gzippé) ne pèse pas sur le premier
// chargement — les trois graphiques partagent le même module
// (une seule requête réseau, un squelette par emplacement).
// ============================================================

export function RevenuePerDayChart({ data }: { data: { date: string; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip formatter={(v: number) => formatXOF(v)} labelStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="revenue" stroke="#d97706" strokeWidth={2} fill="url(#revGradient)" name="CA" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function ClientsPerDayChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="cliGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip labelStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="count" stroke="#059669" strokeWidth={2} fill="url(#cliGradient)" name="Clients" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function RevenueByCategoryChart({
  data,
}: {
  data: { id: string; name: string; revenue: number; units: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
        <Tooltip formatter={(v: number) => formatXOF(v)} labelStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" fill="#f59e0b" radius={[0, 6, 6, 0]} name="CA" />
      </BarChart>
    </ResponsiveContainer>
  )
}
