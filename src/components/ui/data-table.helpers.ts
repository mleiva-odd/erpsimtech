/**
 * Helpers puros del DataTable.
 *
 * Aislados del componente .tsx para que sean testeables sin necesidad de
 * cargar React, lucide, jsPDF, ni el directive 'use client'.
 */

import type { ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface DataTableColumnLike<TRow> {
  key: string;
  header: string;
  accessor?: (row: TRow) => ReactNode;
  exportValue?: (row: TRow) => string;
}

/**
 * Convierte rows en filas planas { header, body } usadas por export CSV/PDF
 * y por cualquier consumidor que quiera serializar los datos visibles.
 */
export function flattenForExport<TRow>(
  rows: TRow[],
  columns: DataTableColumnLike<TRow>[],
): { header: string[]; body: string[][] } {
  const header = columns.map((c) => c.header);
  const body = rows.map((row) =>
    columns.map((c) => {
      if (c.exportValue) return c.exportValue(row);
      if (c.accessor) {
        const val = c.accessor(row);
        if (typeof val === 'string' || typeof val === 'number') return String(val);
        const rec = row as unknown as Record<string, unknown>;
        return rec[c.key] != null ? String(rec[c.key]) : '';
      }
      const rec = row as unknown as Record<string, unknown>;
      return rec[c.key] != null ? String(rec[c.key]) : '';
    }),
  );
  return { header, body };
}

/**
 * Calcula el next sort direction al hacer click en un header.
 * Si la column ya está activa con asc, pasa a desc. Si no, asc.
 */
export function nextSortDirection(
  current: { key: string | null; direction: SortDirection | null },
  clickedKey: string,
): SortDirection {
  if (current.key === clickedKey && current.direction === 'asc') return 'desc';
  return 'asc';
}

/**
 * Calcula totalPages para paginación servidor.
 */
export function calcTotalPages(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}
