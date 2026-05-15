'use client';

/**
 * Fase 22a · Skeleton loaders.
 *
 * Componentes para mostrar UI placeholder mientras se cargan datos.
 * Reemplaza spinners genéricos por barras shimmer estilo Linear/Notion.
 *
 * Uso:
 *   <Skeleton className="h-4 w-32" />
 *   <SkeletonRow columns={5} />
 *   <SkeletonTable rows={10} columns={5} />
 */

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-slate-200/80', className)}
      aria-hidden="true"
    />
  );
}

interface SkeletonRowProps {
  columns: number;
  className?: string;
}

export function SkeletonRow({ columns, className }: SkeletonRowProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3 flex-1', i === 0 && 'max-w-[24%]', i === columns - 1 && 'max-w-[14%]')}
        />
      ))}
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  columns: number;
  className?: string;
}

export function SkeletonTable({ rows = 6, columns, className }: SkeletonTableProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm',
        className,
      )}
      role="status"
      aria-label="Cargando"
    >
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <SkeletonRow columns={columns} />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <SkeletonRow columns={columns} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3',
        className,
      )}
      role="status"
      aria-label="Cargando"
    >
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <div className="pt-2 flex gap-3">
        <Skeleton className="h-3 flex-1" />
        <Skeleton className="h-3 flex-1" />
      </div>
    </div>
  );
}
