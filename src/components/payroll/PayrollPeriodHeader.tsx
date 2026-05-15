'use client';

/**
 * Fase 22c-3 · PayrollPeriodHeader.
 *
 * Header del detalle del periodo de planilla. Muestra:
 *   1. Identificación: nombre, tipo, fechas, estado (badge).
 *   2. KPIs primarios: Total Devengado, Total Deducciones, Neto a Pagar,
 *      Total Empleados.
 *   3. KPIs por concepto: IGSS laboral, IGSS patronal, ISR retenido,
 *      Bono14 provisión, Aguinaldo provisión, Vacaciones provisión. En
 *      planillas REGULAR se muestran las provisiones acumuladas; en
 *      BONO14/AGUINALDO se muestra el devengado de ese concepto.
 *   4. Botones contextuales según `status` (Recalcular, Aprobar, Pagar,
 *      Cancelar) que el padre maneja via callbacks.
 *
 * Componente PRESENTACIONAL: no hace fetch, no abre confirm. Espera que el
 * padre orqueste la confirmación.
 */

import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  BadgeCheck,
  RefreshCw,
  Wallet,
  Ban,
  Loader2,
} from 'lucide-react';

export type PayrollHeaderStatus = 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED';
export type PayrollHeaderType =
  | 'REGULAR'
  | 'BONO14'
  | 'AGUINALDO'
  | 'INDEMNIZACION'
  | 'EXTRAORDINARIA';

export interface PayrollHeaderKpis {
  totalEmployees: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  // Sub-totales por concepto (sumas sobre los items del periodo):
  totalIgssLaboral: number;
  totalIgssPatronal: number;
  totalIsr: number;
  totalBono14: number;
  totalAguinaldo: number;
  totalVacaciones: number;
  totalCostoPatronal: number;
}

interface PayrollPeriodHeaderProps {
  payroll: {
    name: string;
    status: PayrollHeaderStatus;
    payrollType: PayrollHeaderType;
    startDate: string | Date;
    endDate: string | Date;
    periodReference?: string | null;
  };
  kpis: PayrollHeaderKpis;
  isBusy?: boolean;
  /** Callbacks de acciones. El padre decide confirmar antes de invocar. */
  onRecalculate?: () => void;
  onApprove?: () => void;
  onPay?: () => void;
  onCancel?: () => void;
  /** Slot extra para botones (ej. export IGSS / CSV). */
  toolbarExtra?: ReactNode;
}

const STATUS_LABEL: Record<PayrollHeaderStatus, string> = {
  DRAFT: 'Borrador',
  APPROVED: 'Aprobada',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
};

const STATUS_BADGE: Record<PayrollHeaderStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-100',
  APPROVED: 'bg-blue-50 text-blue-700 border-blue-100',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};

const TYPE_LABEL: Record<PayrollHeaderType, string> = {
  REGULAR: 'Regular',
  BONO14: 'Bono 14',
  AGUINALDO: 'Aguinaldo',
  INDEMNIZACION: 'Indemnización',
  EXTRAORDINARIA: 'Extraordinaria',
};

function formatQ(n: number): string {
  return `Q${n.toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function PayrollPeriodHeader({
  payroll,
  kpis,
  isBusy = false,
  onRecalculate,
  onApprove,
  onPay,
  onCancel,
  toolbarExtra,
}: PayrollPeriodHeaderProps) {
  const status = payroll.status;
  const start = new Date(payroll.startDate);
  const end = new Date(payroll.endDate);

  return (
    <section
      aria-label="Cabecera del periodo de planilla"
      className="space-y-5"
    >
      {/* Fila título + estado + acciones */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {payroll.name}
              </h1>
              <span
                className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${STATUS_BADGE[status]}`}
                aria-label={`Estado: ${STATUS_LABEL[status]}`}
              >
                {STATUS_LABEL[status]}
              </span>
            </div>
            <p className="mt-1 text-[13px] font-medium text-slate-500">
              {TYPE_LABEL[payroll.payrollType]} ·{' '}
              {format(start, 'dd MMM yyyy', { locale: es })} —{' '}
              {format(end, 'dd MMM yyyy', { locale: es })}
              {payroll.periodReference ? (
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                  {payroll.periodReference}
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status === 'DRAFT' && onRecalculate && (
            <button
              type="button"
              onClick={onRecalculate}
              disabled={isBusy}
              aria-label="Recalcular planilla"
              className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Recalcular
            </button>
          )}
          {status === 'DRAFT' && onApprove && (
            <button
              type="button"
              onClick={onApprove}
              disabled={isBusy}
              aria-label="Aprobar planilla"
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 disabled:opacity-50"
            >
              <BadgeCheck className="h-4 w-4" />
              Aprobar
            </button>
          )}
          {status === 'APPROVED' && onPay && (
            <button
              type="button"
              onClick={onPay}
              disabled={isBusy}
              aria-label="Marcar planilla como pagada"
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Wallet className="h-4 w-4" />
              Marcar pagada
            </button>
          )}
          {(status === 'DRAFT' || status === 'APPROVED') && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isBusy}
              aria-label="Cancelar planilla"
              className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
            >
              <Ban className="h-4 w-4" />
              Cancelar
            </button>
          )}
          {toolbarExtra}
        </div>
      </div>

      {/* KPIs primarios */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Empleados"
          value={String(kpis.totalEmployees)}
          tone="neutral"
        />
        <KpiCard
          label="Total devengado"
          value={formatQ(kpis.totalGross)}
          tone="neutral"
        />
        <KpiCard
          label="Total deducciones"
          value={formatQ(kpis.totalDeductions)}
          tone="danger"
        />
        <KpiCard
          label="Neto a pagar"
          value={formatQ(kpis.totalNet)}
          tone="success"
          highlight
        />
      </div>

      {/* KPIs por concepto */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
          Resumen por concepto del periodo
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
          <MiniKpi label="IGSS laboral" value={formatQ(kpis.totalIgssLaboral)} />
          <MiniKpi label="IGSS patronal" value={formatQ(kpis.totalIgssPatronal)} />
          <MiniKpi label="ISR retenido" value={formatQ(kpis.totalIsr)} />
          <MiniKpi label="Bono 14" value={formatQ(kpis.totalBono14)} />
          <MiniKpi label="Aguinaldo" value={formatQ(kpis.totalAguinaldo)} />
          <MiniKpi label="Vacaciones" value={formatQ(kpis.totalVacaciones)} />
          <MiniKpi
            label="Costo patronal"
            value={formatQ(kpis.totalCostoPatronal)}
          />
        </div>
        {payroll.payrollType === 'REGULAR' && (
          <p className="mt-3 text-[11px] italic text-slate-400">
            Bono 14, Aguinaldo y Vacaciones representan la provisión devengada
            del periodo (costo patronal mensual). El pago efectivo ocurre en
            planillas BONO14 / AGUINALDO o al gozar vacaciones.
          </p>
        )}
      </div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  tone,
  highlight = false,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'success' | 'danger';
  highlight?: boolean;
}) {
  const valueColor =
    tone === 'success'
      ? 'text-emerald-600'
      : tone === 'danger'
        ? 'text-rose-500'
        : 'text-slate-900';
  const borderAccent = highlight ? 'border-b-4 border-b-emerald-500' : '';
  return (
    <div
      className={`rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5 ${borderAccent}`}
    >
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <span className={`block text-xl font-bold sm:text-2xl ${valueColor}`}>
        {value}
      </span>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50/60 p-3">
      <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <span className="mt-0.5 block text-sm font-bold text-slate-800">
        {value}
      </span>
    </div>
  );
}
