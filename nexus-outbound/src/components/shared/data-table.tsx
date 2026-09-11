"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface Column<T> {
  key: string;
  title: string;
  sortable?: boolean;
  className?: string;
  render?: (value: unknown, row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  selectable?: boolean;
  onSelectionChange?: (selectedIds: string[]) => void;
  actions?: React.ReactNode;
  emptyMessage?: string;
  loading?: boolean;
}

// ─────────────────────────────────────────────
// DataTable Component
// ─────────────────────────────────────────────

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  searchable = true,
  searchPlaceholder = "Search...",
  pageSize = 10,
  selectable = false,
  onSelectionChange,
  actions,
  emptyMessage = "No data found",
  loading = false,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filter
  const filtered = search
    ? data.filter((row) =>
        columns.some((col) => {
          const val = row[col.key];
          return val != null && String(val).toLowerCase().includes(search.toLowerCase());
        })
      )
    : data;

  // Sort
  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filtered;

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safeCurrentPage = Math.min(page, totalPages);
  const paginated = sorted.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    onSelectionChange?.(Array.from(next));
  };

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
      onSelectionChange?.([]);
    } else {
      const ids = paginated.map((r) => String(r[keyField]));
      setSelected(new Set(ids));
      onSelectionChange?.(ids);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#111128] overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
        {searchable && (
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-8 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              {selectable && (
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={paginated.length > 0 && selected.size === paginated.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-600 bg-transparent"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500",
                    col.sortable && "cursor-pointer select-none hover:text-gray-300",
                    col.className
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.title}
                    {col.sortable && sortKey === col.key && (
                      sortDir === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-white/5">
                  {selectable && <td className="px-4 py-4"><div className="h-4 w-4 animate-pulse rounded bg-white/5" /></td>}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-4">
                      <div className="h-4 animate-pulse rounded bg-white/5" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((row) => {
                const id = String(row[keyField]);
                return (
                  <tr
                    key={id}
                    className={cn(
                      "border-b border-white/5 transition-colors hover:bg-white/[0.02]",
                      selected.has(id) && "bg-blue-500/5"
                    )}
                  >
                    {selectable && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleSelect(id)}
                          className="rounded border-gray-600 bg-transparent"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn("px-4 py-3 text-sm text-gray-300", col.className)}
                      >
                        {col.render
                          ? col.render(row[col.key], row)
                          : row[col.key] != null
                          ? String(row[col.key])
                          : "—"}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
        <span className="text-xs text-gray-500">
          {sorted.length === 0
            ? "No results"
            : `Showing ${(safeCurrentPage - 1) * pageSize + 1}–${Math.min(
                safeCurrentPage * pageSize,
                sorted.length
              )} of ${sorted.length}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            disabled={safeCurrentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (safeCurrentPage <= 3) {
              pageNum = i + 1;
            } else if (safeCurrentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = safeCurrentPage - 2 + i;
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={cn(
                  "h-8 w-8 rounded-lg text-xs font-medium transition-colors",
                  safeCurrentPage === pageNum
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:bg-white/5 hover:text-white"
                )}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
