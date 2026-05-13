'use client';

/**
 * Fase 22a · DataTable reutilizable.
 *
 * Características:
 *  - Paginación servidor (page/pageSize controlados por el padre).
 *  - Sort por columna (header clickeable, dispara onSort).
 *  - Filtros por columna (text/select) - opcionales.
 *  - Export CSV / PDF cliente-side con jsPDF.
 *  - Selección múltiple + acción masiva.
 *  - Vista card en mobile (< md) y tabla en desktop (>= md).
 *  - Loading skeleton.
 *
 * Nota: este componente es genérico. El padre construye `columns` con
 * `accessor` (puede ser una key del row o una función render).
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Download,
  FileText,
  Search,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type SortDirection = 'asc' | 'desc';

export interface DataTableColumn<TRow> {
  /** Key estable - usada para sort/filter. */
  key: string;
  /** Texto del header. */
  header: string;
  /** Render del valor. Si no se especifica, se toma row[key]. */
  accessor?: (row: TRow) => ReactNode;
  /** Valor para CSV/PDF (string). */
  exportValue?: (row: TRow) => string;
  /** Si la columna soporta sort. */
  sortable?: boolean;
  /** Si la columna soporta filtro text/select. */
  filterable?: boolean;
  /** Opciones de un filtro select. Si se omite, el filtro es texto libre. */
  filterOptions?: Array<{ value: string; label: string }>;
  /** Clase extra del cell. */
  cellClassName?: string;
  /** Clase extra del header. */
  headerClassName?: string;
  /** Tamaño relativo (Tailwind w-*) opcional. */
  widthClassName?: string;
  /** En mobile (vista card): cuál columna usar como "título" y cuál como "valor destacado". */
  mobilePriority?: 'title' | 'highlight' | 'meta' | 'hidden';
}

export interface DataTableProps<TRow> {
  columns: DataTableColumn<TRow>[];
  data: TRow[];
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onSort?: (key: string, direction: SortDirection) => void;
  onFilter?: (filters: Record<string, string>) => void;
  loading?: boolean;
  /** Si se provee, habilita selección múltiple. Función para extraer el id. */
  getRowId?: (row: TRow) => string;
  /** Acciones masivas a renderizar cuando hay selección. */
  bulkActions?: Array<{
    label: string;
    onClick: (selectedIds: string[]) => void;
    variant?: 'default' | 'danger';
  }>;
  /** Habilitar export CSV. */
  enableCsvExport?: boolean;
  /** Habilitar export PDF. */
  enablePdfExport?: boolean;
  /** Nombre base del archivo exportado. */
  exportFileName?: string;
  /** Render personalizado para click de row. */
  onRowClick?: (row: TRow) => void;
  /** Mensaje cuando no hay datos. */
  emptyMessage?: string;
  /** Sort actual (controlado). */
  sortKey?: string;
  sortDirection?: SortDirection;
}

function flattenForExport<TRow>(
  rows: TRow[],
  columns: DataTableColumn<TRow>[],
): { header: string[]; body: string[][] } {
  const header = columns.map((c) => c.header);
  const body = rows.map((row) =>
    columns.map((c) => {
      if (c.exportValue) return c.exportValue(row);
      if (c.accessor) {
        const val = c.accessor(row);
        if (typeof val === 'string' || typeof val === 'number') return String(val);
        // fallback: intentar leer row[key]
        const rec = row as unknown as Record<string, unknown>;
        return rec[c.key] != null ? String(rec[c.key]) : '';
      }
      const rec = row as unknown as Record<string, unknown>;
      return rec[c.key] != null ? String(rec[c.key]) : '';
    }),
  );
  return { header, body };
}

export function DataTable<TRow>({
  columns,
  data,
  total,
  page = 1,
  pageSize = 20,
  onPageChange,
  onSort,
  onFilter,
  loading = false,
  getRowId,
  bulkActions,
  enableCsvExport = false,
  enablePdfExport = false,
  exportFileName = 'export',
  onRowClick,
  emptyMessage = 'Sin datos para mostrar.',
  sortKey,
  sortDirection,
}: DataTableProps<TRow>) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const totalCount = total ?? data.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const hasFilters = useMemo(() => columns.some((c) => c.filterable), [columns]);

  const updateFilter = (key: string, value: string) => {
    const next = { ...filters, [key]: value };
    if (!value) delete next[key];
    setFilters(next);
    onFilter?.(next);
  };

  const handleSort = (col: DataTableColumn<TRow>) => {
    if (!col.sortable || !onSort) return;
    const nextDir: SortDirection =
      sortKey === col.key && sortDirection === 'asc' ? 'desc' : 'asc';
    onSort(col.key, nextDir);
  };

  const toggleSelectAll = () => {
    if (!getRowId) return;
    const allIds = data.map(getRowId);
    if (allIds.every((id) => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    const { header, body } = flattenForExport(data, columns);
    const csv = [
      header.join(','),
      ...body.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFileName}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const { header, body } = flattenForExport(data, columns);
    const doc = new jsPDF({ orientation: header.length > 6 ? 'landscape' : 'portrait' });
    doc.setFontSize(14);
    doc.text(exportFileName.replace(/_/g, ' '), 14, 15);
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, 14, 21);
    autoTable(doc, {
      head: [header],
      body,
      startY: 25,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 8 },
    });
    doc.save(`${exportFileName}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const selectedArray = Array.from(selectedIds);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        {hasFilters && (
          <div className="flex flex-wrap gap-2 flex-1">
            {columns
              .filter((c) => c.filterable)
              .map((c) =>
                c.filterOptions ? (
                  <select
                    key={`filter-${c.key}`}
                    aria-label={`Filtrar por ${c.header}`}
                    value={filters[c.key] || ''}
                    onChange={(e) => updateFilter(c.key, e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                  >
                    <option value="">{c.header}: todas</option>
                    {c.filterOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div key={`filter-${c.key}`} className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      aria-label={`Filtrar por ${c.header}`}
                      placeholder={c.header}
                      value={filters[c.key] || ''}
                      onChange={(e) => updateFilter(c.key, e.target.value)}
                      className="pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>
                ),
              )}
          </div>
        )}
        <div className="flex gap-2">
          {enableCsvExport && (
            <button
              type="button"
              onClick={exportCsv}
              disabled={data.length === 0}
              aria-label="Exportar CSV"
              className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-bold hover:bg-green-100 transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
          )}
          {enablePdfExport && (
            <button
              type="button"
              onClick={exportPdf}
              disabled={data.length === 0}
              aria-label="Exportar PDF"
              className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-bold hover:bg-red-100 transition disabled:opacity-50"
            >
              <FileText className="w-4 h-4" /> PDF
            </button>
          )}
        </div>
      </div>

      {/* Bulk actions */}
      {bulkActions && bulkActions.length > 0 && selectedArray.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
          <span className="text-sm font-bold text-blue-700">
            {selectedArray.length} seleccionados
          </span>
          {bulkActions.map((act) => (
            <button
              key={act.label}
              type="button"
              onClick={() => act.onClick(selectedArray)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                act.variant === 'danger'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {act.label}
            </button>
          ))}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 border-b border-slate-100">
                {getRowId && bulkActions && bulkActions.length > 0 && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      checked={
                        data.length > 0 &&
                        data.every((r) => selectedIds.has(getRowId(r)))
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 font-bold uppercase ${col.headerClassName || ''} ${
                      col.widthClassName || ''
                    } ${col.sortable ? 'cursor-pointer select-none hover:bg-slate-100' : ''}`}
                    onClick={() => handleSort(col)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && sortKey === col.key && (
                        sortDirection === 'asc' ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="animate-pulse">
                    {getRowId && bulkActions && bulkActions.length > 0 && (
                      <td className="px-4 py-3">
                        <div className="h-4 w-4 bg-slate-200 rounded" />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={`skel-${i}-${c.key}`} className="px-4 py-3">
                        <div className="h-3 bg-slate-200 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (getRowId && bulkActions ? 1 : 0)}
                    className="px-4 py-12 text-center text-sm text-slate-400"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => {
                  const id = getRowId ? getRowId(row) : String(idx);
                  return (
                    <tr
                      key={id}
                      className={`${
                        onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''
                      } transition`}
                      onClick={() => onRowClick?.(row)}
                    >
                      {getRowId && bulkActions && bulkActions.length > 0 && (
                        <td
                          className="px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar fila ${id}`}
                            checked={selectedIds.has(id)}
                            onChange={() => toggleSelect(id)}
                            className="rounded border-slate-300"
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={`${id}-${col.key}`}
                          className={`px-4 py-3 text-sm ${col.cellClassName || ''}`}
                        >
                          {col.accessor
                            ? col.accessor(row)
                            : ((row as unknown as Record<string, unknown>)[col.key] as ReactNode) ?? ''}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`skel-card-${i}`}
              className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse"
            >
              <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))
        ) : data.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-sm text-slate-400">
            {emptyMessage}
          </div>
        ) : (
          data.map((row, idx) => {
            const id = getRowId ? getRowId(row) : String(idx);
            const titleCol = columns.find((c) => c.mobilePriority === 'title') || columns[0];
            const highlightCol = columns.find((c) => c.mobilePriority === 'highlight');
            const metaCols = columns.filter(
              (c) =>
                c !== titleCol &&
                c !== highlightCol &&
                c.mobilePriority !== 'hidden',
            );
            return (
              <div
                key={id}
                className={`bg-white rounded-2xl border border-slate-100 p-4 shadow-sm ${
                  onRowClick ? 'cursor-pointer active:scale-[0.99]' : ''
                } transition`}
                onClick={() => onRowClick?.(row)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {getRowId && bulkActions && bulkActions.length > 0 && (
                      <label
                        className="inline-flex items-center gap-2 mb-2 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar fila ${id}`}
                          checked={selectedIds.has(id)}
                          onChange={() => toggleSelect(id)}
                          className="rounded border-slate-300"
                        />
                        <span className="text-slate-400">Seleccionar</span>
                      </label>
                    )}
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {titleCol.header}
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {titleCol.accessor
                        ? titleCol.accessor(row)
                        : ((row as unknown as Record<string, unknown>)[titleCol.key] as ReactNode) ?? ''}
                    </div>
                  </div>
                  {highlightCol && (
                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">
                        {highlightCol.header}
                      </div>
                      <div className="text-base font-bold text-blue-600">
                        {highlightCol.accessor
                          ? highlightCol.accessor(row)
                          : ((row as unknown as Record<string, unknown>)[
                              highlightCol.key
                            ] as ReactNode) ?? ''}
                      </div>
                    </div>
                  )}
                </div>
                {metaCols.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                    {metaCols.map((col) => (
                      <div key={`${id}-mobile-${col.key}`} className="min-w-0">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                          {col.header}
                        </div>
                        <div className="text-xs text-slate-700 truncate">
                          {col.accessor
                            ? col.accessor(row)
                            : ((row as unknown as Record<string, unknown>)[col.key] as ReactNode) ?? ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {onPageChange && totalCount > pageSize && (
        <div className="flex items-center justify-between gap-3 mt-2">
          <p className="text-xs text-slate-500">
            Página {page} de {totalPages} · {totalCount} registros
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Página anterior"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Página siguiente"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
