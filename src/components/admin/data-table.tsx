"use client"

import { useState } from "react"
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export interface SelectionConfig<TData> {
  /** Identifiant stable d'une ligne (ex : o => o.id). */
  getRowId: (row: TData) => string
  /** Identifiants actuellement sélectionnés (contrôlé par la page). */
  selectedIds: string[]
  /** Callback avec la NOUVELLE liste d'identifiants sélectionnés. */
  onSelectedIdsChange: (ids: string[]) => void
  /** Lignes non sélectionnables (ex : commandes payées pour une suppression). */
  isRowSelectable?: (row: TData) => boolean
}

/**
 * Table de données admin générique : recherche globale, tri, pagination,
 * squelettes de chargement, état vide soigné — et SÉLECTION MULTIPLE
 * optionnelle (colonne de cases à cocher + « tout sélectionner ») pour
 * les actions groupées (suppression, etc.).
 */
export function DataTable<TData>({
  columns,
  data,
  loading,
  searchPlaceholder = "Rechercher…",
  searchColumn,
  emptyMessage = "Aucun résultat.",
  pageSize = 10,
  toolbar,
  onRowClick,
  selection,
}: {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  loading?: boolean
  searchPlaceholder?: string
  searchColumn?: string
  emptyMessage?: string
  pageSize?: number
  toolbar?: React.ReactNode
  onRowClick?: (row: TData) => void
  /** Active la colonne de sélection + fournit l'état contrôlé. */
  selection?: SelectionConfig<TData>
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: searchColumn ? undefined : globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: searchColumn ? undefined : setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    globalFilterFn: "includesString",
  })

  // ---------- Logique de sélection (contrôlée par la page) ----------
  const selectedSet = new Set(selection?.selectedIds ?? [])

  function toggleRow(row: TData) {
    if (!selection) return
    const id = selection.getRowId(row)
    const next = new Set(selectedSet)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selection.onSelectedIdsChange([...next])
  }

  function visibleSelectableRows(): TData[] {
    if (!selection) return []
    return table.getFilteredRowModel().rows.map((r) => r.original).filter((row) => selection.isRowSelectable?.(row) ?? true)
  }

  function toggleAllFiltered(checked: boolean) {
    if (!selection) return
    const rows = visibleSelectableRows()
    const next = new Set(selectedSet)
    for (const row of rows) {
      const id = selection.getRowId(row)
      if (checked) next.add(id)
      else next.delete(id)
    }
    selection.onSelectedIdsChange([...next])
  }

  const selectableRows = visibleSelectableRows()
  const allVisibleSelected =
    selection !== undefined && selectableRows.length > 0 && selectableRows.every((r) => selectedSet.has(selection.getRowId(r)))
  const someVisibleSelected = selection !== undefined && !allVisibleSelected && selectableRows.some((r) => selectedSet.has(selection.getRowId(r)))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchColumn ? globalFilter : (table.getState().globalFilter as string) ?? ""}
            onChange={(e) => searchColumn ? setGlobalFilter(e.target.value) : table.setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 pl-8"
          />
        </div>
        {toolbar}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-secondary/50 hover:bg-secondary/50">
                {selection !== undefined && (
                  <TableHead className="w-10 pr-0">
                    <Checkbox
                      aria-label="Tout sélectionner (filtré)"
                      checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleAllFiltered(v === true)}
                      disabled={selectableRows.length === 0}
                    />
                  </TableHead>
                )}
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, {
                      ...header.getContext(),
                    })}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {selection !== undefined && (
                    <TableCell>
                      <div className="h-4 animate-pulse rounded bg-secondary" />
                    </TableCell>
                  )}
                  {table.getAllLeafColumns().map((col, j) => (
                    <TableCell key={j}>
                      <div className="h-4 animate-pulse rounded bg-secondary" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => {
                const selectable = selection?.isRowSelectable?.(row.original) ?? true
                const rowId = selection ? selection.getRowId(row.original) : ""
                const isSelected = selection !== undefined && selectedSet.has(rowId)
                return (
                  <TableRow
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(
                      onRowClick && "cursor-pointer hover:bg-secondary/40",
                      isSelected && "bg-brand-soft/40 hover:bg-brand-soft/40",
                    )}
                    data-state={isSelected ? "selected" : undefined}
                  >
                    {selection !== undefined && (
                      <TableCell className="w-10 pr-0" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label="Sélectionner cette ligne"
                          checked={isSelected}
                          disabled={!selectable}
                          onCheckedChange={(v) => toggleRow(row.original)}
                        />
                      </TableCell>
                    )}
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={table.getAllLeafColumns().length + (selection !== undefined ? 1 : 0)} className="h-28 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>
          {table.getFilteredRowModel().rows.length} résultat(s)
          {selection !== undefined && selection.selectedIds.length > 0 && (
            <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-foreground">
              {selection.selectedIds.length} sélectionnée(s)
            </span>
          )}
          {" — page "}
          {table.getState().pagination.pageIndex + 1} /{" "}
          {Math.max(1, table.getPageCount())}
        </p>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" /> Précédent
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Suivant <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export { ArrowUpDown }
