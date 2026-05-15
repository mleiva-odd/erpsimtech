'use client';

/**
 * Fase 22c-4 · RfqStatusBadge
 *
 * Badge visual para el estado de una RFQ. OPEN es sinónimo legacy de SENT.
 */

import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  OPEN: 'Enviado',
  SENT: 'Enviado',
  AWARDED: 'Adjudicado',
  CANCELLED: 'Cancelado',
  CLOSED: 'Cerrado',
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  OPEN: 'bg-amber-50 text-amber-700 border-amber-100',
  SENT: 'bg-amber-50 text-amber-700 border-amber-100',
  AWARDED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
  CLOSED: 'bg-blue-50 text-blue-700 border-blue-100',
};

export function RfqStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const label = STATUS_LABEL[status] ?? status;
  const cls = STATUS_CLASS[status] ?? 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest',
        cls,
        className,
      )}
      aria-label={`Estado: ${label}`}
    >
      {label}
    </span>
  );
}
