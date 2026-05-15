'use client';

/**
 * Fase 22a · useDataTable.
 *
 * Hook que centraliza el state de paginación + sort + filters + search para
 * cualquier tabla servidor. No conoce el shape de los datos: el caller pasa
 * `onFetch(params)` y recibe `{ data, total }`.
 *
 * Maneja:
 *  - Debounce de search (300 ms).
 *  - Reset de page=1 al cambiar search / filter / sort.
 *  - Cancelación de queries previas (AbortController) para evitar race conditions.
 *  - Error catch → toast.
 *
 * Uso:
 *   const table = useDataTable<Product>({
 *     onFetch: async ({ page, limit, search, sortBy, sortDir, filters, signal }) => {
 *       const res = await fetch(`/api/products?${new URLSearchParams(...)}`, { signal });
 *       const json = await res.json();
 *       return { data: json.products, total: json.total };
 *     },
 *   });
 *
 *   <DataTable
 *     columns={cols}
 *     data={table.data}
 *     loading={table.loading}
 *     page={table.pagination.page}
 *     pageSize={table.pagination.limit}
 *     total={table.pagination.total}
 *     onPageChange={table.pagination.onPageChange}
 *     onSort={table.sort.onSortChange}
 *     ...
 *   />
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { useDebounce } from './useDebounce';

export type SortDir = 'asc' | 'desc';

export interface DataTableQueryParams {
  page: number;
  limit: number;
  search: string;
  sortBy: string | null;
  sortDir: SortDir | null;
  filters: Record<string, unknown>;
  signal?: AbortSignal;
}

interface UseDataTableOptions<T> {
  defaultLimit?: number;
  defaultSortBy?: string;
  defaultSortDir?: SortDir;
  defaultFilters?: Record<string, unknown>;
  /** Tiempo de debounce del search (ms). Default 300. */
  searchDebounceMs?: number;
  /** Fetcher. Debe respetar `signal` si quiere soportar cancelación. */
  onFetch: (params: DataTableQueryParams) => Promise<{ data: T[]; total: number }>;
  /** Mensaje toast de error. */
  errorMessage?: string;
  /** Cargar automáticamente al montar (default true). */
  autoLoad?: boolean;
}

export interface UseDataTableResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onLimitChange: (limit: number) => void;
  };
  sort: {
    sortBy: string | null;
    sortDir: SortDir | null;
    onSortChange: (key: string, dir: SortDir) => void;
  };
  search: {
    value: string;
    onChange: (value: string) => void;
  };
  filters: Record<string, unknown>;
  setFilter: (key: string, value: unknown) => void;
  clearFilters: () => void;
  refetch: () => Promise<void>;
}

export function useDataTable<T>(opts: UseDataTableOptions<T>): UseDataTableResult<T> {
  const {
    defaultLimit = 20,
    defaultSortBy,
    defaultSortDir,
    defaultFilters = {},
    searchDebounceMs = 300,
    onFetch,
    errorMessage = 'Error al cargar los datos.',
    autoLoad = true,
  } = opts;

  const { toast } = useToast();

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(autoLoad);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);

  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(defaultLimit);
  const [sortBy, setSortBy] = useState<string | null>(defaultSortBy ?? null);
  const [sortDir, setSortDir] = useState<SortDir | null>(defaultSortDir ?? null);
  const [searchValue, setSearchValue] = useState<string>('');
  const [filters, setFilters] = useState<Record<string, unknown>>(defaultFilters);

  const debouncedSearch = useDebounce(searchValue, searchDebounceMs);

  const abortRef = useRef<AbortController | null>(null);
  const onFetchRef = useRef(onFetch);
  // Mantener ref siempre fresca pero sin que dispare fetch.
  useEffect(() => {
    onFetchRef.current = onFetch;
  }, [onFetch]);

  const fetchData = useCallback(async () => {
    // Cancelar request previo si existe
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = await onFetchRef.current({
        page,
        limit,
        search: debouncedSearch,
        sortBy,
        sortDir,
        filters,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setData(result.data);
      setTotal(result.total);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : errorMessage;
      setError(msg);
      toast({ tone: 'error', message: msg });
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [page, limit, debouncedSearch, sortBy, sortDir, filters, errorMessage, toast]);

  useEffect(() => {
    if (!autoLoad) return;
    fetchData();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchData, autoLoad]);

  // Reset page=1 cuando cambian search / filtros / sort.
  // No reseteamos si sólo cambia `page` o `limit`.
  const resetSig = useMemo(
    () => JSON.stringify({ debouncedSearch, filters, sortBy, sortDir }),
    [debouncedSearch, filters, sortBy, sortDir],
  );
  const firstResetRun = useRef(true);
  useEffect(() => {
    if (firstResetRun.current) {
      firstResetRun.current = false;
      return;
    }
    setPage(1);
  }, [resetSig]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const onSortChange = useCallback((key: string, dir: SortDir) => {
    setSortBy(key);
    setSortDir(dir);
  }, []);

  const setFilter = useCallback((key: string, value: unknown) => {
    setFilters((current) => {
      const next = { ...current };
      if (value === undefined || value === null || value === '') {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, [defaultFilters]);

  return {
    data,
    loading,
    error,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      onPageChange: setPage,
      onLimitChange: setLimit,
    },
    sort: {
      sortBy,
      sortDir,
      onSortChange,
    },
    search: {
      value: searchValue,
      onChange: setSearchValue,
    },
    filters,
    setFilter,
    clearFilters,
    refetch: fetchData,
  };
}
