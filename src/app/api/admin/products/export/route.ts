// GET /api/admin/products/export — export CSV du catalogue produits (Excel FR).
//
// - Permission products.view (même règle que la liste des produits).
// - CSV UTF-8 AVEC BOM (\uFEFF), séparateur « ; », valeurs échappées.
// - Mini-cache local 30 s (globalThis) : la requête produits n'est rejouée
//   qu'une fois par demi-minute même si plusieurs exports sont demandés
//   (Supabase distant : on évite les allers-retours inutiles).
// - Journalisation via logActivity, comme toutes les routes admin.
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { handle } from "@/lib/api"
import { requireStaff } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { PRODUCT_STATUS_LABELS, PRODUCT_TYPE_LABELS } from "@/lib/constants"

interface ExportRow {
  name: string
  slug: string
  type: string
  status: string
  price: number
  salePrice: number | null
  stock: number
  trackInventory: boolean
  sku: string | null
  ratingAvg: number
  salesCount: number
  isFeatured: boolean
  createdAt: Date
  categories: { category: { name: string } }[]
}

// ---------- Mini-cache local (30 s) — aucune dépendance à d'autres fichiers ----------

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const CACHE_TTL_MS = 30_000

const globalForExport = globalThis as typeof globalThis & {
  __tmProductExportCache?: CacheEntry<ExportRow[]>
}

async function loadProducts(): Promise<ExportRow[]> {
  const cached = globalForExport.__tmProductExportCache
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const rows = await db.product.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      slug: true,
      type: true,
      status: true,
      price: true,
      salePrice: true,
      stock: true,
      trackInventory: true,
      sku: true,
      ratingAvg: true,
      salesCount: true,
      isFeatured: true,
      createdAt: true,
      categories: { select: { category: { select: { name: true } } } },
    },
  })
  globalForExport.__tmProductExportCache = { value: rows, expiresAt: Date.now() + CACHE_TTL_MS }
  return rows
}

// ---------- Helpers CSV ----------

/** Échappe une valeur : guillemets si « ; », « " » ou saut de ligne présents. */
function csvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value)
  if (/[";\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

function formatDateFr(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}/${month}/${date.getFullYear()}`
}

function buildCsv(rows: ExportRow[]): string {
  const header = [
    "Nom",
    "Slug",
    "Type",
    "Statut",
    "Prix FCFA",
    "Prix promo",
    "Stock",
    "SKU",
    "Catégories",
    "Note",
    "Nb ventes",
    "Mis en avant",
    "Créé le",
  ]
  const lines = rows.map((p) =>
    [
      p.name,
      p.slug,
      PRODUCT_TYPE_LABELS[p.type] ?? p.type,
      PRODUCT_STATUS_LABELS[p.status] ?? p.status,
      p.price,
      p.salePrice ?? "",
      p.trackInventory ? p.stock : "Illimité",
      p.sku ?? "",
      p.categories.map((c) => c.category.name).join(", "),
      p.ratingAvg > 0 ? p.ratingAvg.toFixed(2) : "",
      p.salesCount,
      p.isFeatured ? "Oui" : "Non",
      formatDateFr(p.createdAt),
    ]
      .map(csvCell)
      .join(";"),
  )
  // BOM UTF-8 pour Excel + retours à la ligne CRLF.
  return "\uFEFF" + [header.map(csvCell).join(";"), ...lines].join("\r\n")
}

// ---------- Route ----------

export async function GET() {
  return handle(async () => {
    const actor = await requireStaff("products.view")
    const rows = await loadProducts()
    const csv = buildCsv(rows)

    await logActivity({
      actor: { id: actor.id, name: actor.name, role: actor.role },
      action: "product.export_csv",
      entityType: "product",
      details: { count: rows.length, format: "csv" },
    })

    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="produits-teranga-${dateStamp}.csv"`,
      },
    })
  })
}
