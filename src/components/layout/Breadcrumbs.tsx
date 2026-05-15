'use client';

/**
 * Fase 22a · Breadcrumbs.
 *
 * Navegación migaja de pan reutilizable.
 *  - Desktop (md+): "Home / Sales / Ventas del día" con separador "/".
 *  - Mobile (< md): sólo la última item visible + botón "Atrás" con flecha.
 *
 * Uso:
 *   <Breadcrumbs items={[
 *     { label: 'Inicio', href: '/dashboard' },
 *     { label: 'Ventas', href: '/sales' },
 *     { label: 'Detalle' },
 *   ]} />
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  /** Si true, oculta el item raíz "Inicio" en mobile (default true). */
  hideRootOnMobile?: boolean;
}

export function Breadcrumbs({
  items,
  className,
  hideRootOnMobile = true,
}: BreadcrumbsProps) {
  const router = useRouter();
  if (items.length === 0) return null;

  const last = items[items.length - 1];
  const previous = items.length > 1 ? items[items.length - 2] : null;

  const handleBack = () => {
    if (previous?.href) {
      router.push(previous.href);
    } else {
      router.back();
    }
  };

  return (
    <nav
      aria-label="Migas de pan"
      className={cn('text-sm text-slate-500', className)}
    >
      {/* Mobile (< md): back button + último item */}
      <div className="flex items-center gap-2 md:hidden">
        {previous && (
          <button
            type="button"
            onClick={handleBack}
            aria-label={`Volver a ${previous.label}`}
            className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100 transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <span className="font-bold text-slate-800 truncate">{last.label}</span>
      </div>

      {/* Desktop (md+): lista completa */}
      <ol className={cn('hidden md:flex md:items-center md:gap-1.5 md:flex-wrap', hideRootOnMobile && '')}>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-1.5">
              {idx > 0 && (
                <ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="hover:text-blue-600 transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    isLast ? 'font-bold text-slate-800' : 'text-slate-500',
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
