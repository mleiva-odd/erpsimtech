'use client';

/**
 * Fase 22a · EmptyState.
 *
 * Componente para estados vacíos consistentes en toda la app.
 * Útil cuando una lista, tabla, búsqueda o filtro no devuelve datos.
 *
 * Uso:
 *   <EmptyState
 *     icon={<PackageIcon />}
 *     title="No hay productos"
 *     description="Crea tu primer producto para empezar"
 *     action={<Button>Crear producto</Button>}
 *   />
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Icono (lucide-react o componente equivalente). */
  icon?: ReactNode;
  /** Título principal. */
  title: string;
  /** Descripción secundaria. */
  description?: string;
  /** Acción primaria (un botón, link, etc). */
  action?: ReactNode;
  /** Clase extra del wrapper. */
  className?: string;
  /** Tamaño visual. */
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  size = 'md',
}: EmptyStateProps) {
  const padding = size === 'sm' ? 'py-8' : size === 'lg' ? 'py-20' : 'py-14';
  const iconBoxSize = size === 'sm' ? 'h-10 w-10' : size === 'lg' ? 'h-16 w-16' : 'h-14 w-14';
  const titleSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-4',
        padding,
        className,
      )}
      role="status"
    >
      {icon && (
        <div
          className={cn(
            'mb-4 flex items-center justify-center rounded-2xl bg-slate-100 text-slate-400',
            iconBoxSize,
          )}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <h3 className={cn('font-bold text-slate-800', titleSize)}>{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm text-slate-500 leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
