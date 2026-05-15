'use client';

/**
 * Fase 22c-3 · PayslipDetailDrawer.
 *
 * Drawer lateral derecho con el desglose COMPLETO de un PayrollItem
 * (boleta de pago). Distinto del PDF (que es para imprimir), este drawer
 * está pensado para revisión rápida en pantalla:
 *
 *   - Identidad del empleado (nombre, posición, DPI/NIT, IGSS).
 *   - Sección Devengado: salario base, bonificación incentivo, horas
 *     extras desglosadas (diurnas/nocturnas/festivas), séptimo día,
 *     comisiones, otros bonos.
 *   - Sección Deducciones: IGSS laboral (4.83%), ISR, préstamos, otras.
 *   - Sección Provisiones patronales (Bono14, Aguinaldo, Vacaciones,
 *     Indemnización) — solo visibles para mostrar costo real, NO se
 *     descuentan al empleado.
 *   - Sección Cargas patronales (IGSS 10.67% + IRTRA 1% + INTECAP 1%).
 *   - Observaciones (notes).
 *   - Acciones: Descargar PDF, Editar (si DRAFT), cerrar.
 *
 * El drawer es PRESENTACIONAL — todas las acciones se delegan al padre.
 *
 * A11y: role="dialog", aria-modal, focus inicial al título, ESC para
 * cerrar, scroll del body bloqueado mientras está abierto.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import {
  X,
  Download,
  Pencil,
  User as UserIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export interface PayslipDetailItem {
  id: string;
  employeeId: string;
  daysWorked: number;
  baseSalary: number;
  bonusIncentive: number;
  overtimeRegularHours: number;
  overtimeRegularAmount: number;
  overtimeNightHours: number;
  overtimeNightAmount: number;
  overtimeHolidayHours: number;
  overtimeHolidayAmount: number;
  seventhDayAmount: number;
  commissions: number;
  otherBonuses: number;
  totalGross: number;
  igssLaboral: number;
  isr: number;
  loanDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  bono14Provision: number;
  aguinaldoProvision: number;
  indemnizacionProvision: number;
  vacacionesProvision: number;
  igssPatronal: number;
  irtra: number;
  intecap: number;
  totalCostoPatronal: number;
  notes?: string | null;
  employee: {
    firstName: string;
    lastName: string;
    position?: string | null;
    documentId?: string | null;
    nit?: string | null;
    igssNumber?: string | null;
    hireDate?: string | Date | null;
  };
}

interface PayslipDetailDrawerProps {
  open: boolean;
  item: PayslipDetailItem | null;
  /** Estado del Payroll padre — controla si "Editar" se muestra. */
  payrollStatus: 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED';
  onClose: () => void;
  onDownloadPdf?: (item: PayslipDetailItem) => void;
  onEdit?: (item: PayslipDetailItem) => void;
}

function formatQ(n: number): string {
  return `Q${(Number(n) || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatHrs(n: number): string {
  return `${(Number(n) || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} hrs`;
}

export function PayslipDetailDrawer({
  open,
  item,
  payrollStatus,
  onClose,
  onDownloadPdf,
  onEdit,
}: PayslipDetailDrawerProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Foco inicial al título para lectores de pantalla.
    titleRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !item) return null;

  const employeeName = `${item.employee.firstName} ${item.employee.lastName}`;

  return (
    <div
      className="fixed inset-0 z-[90] flex"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de boleta de ${employeeName}`}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar detalle"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="relative ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 font-bold"
              aria-hidden="true"
            >
              {item.employee.firstName.charAt(0)}
              {item.employee.lastName.charAt(0)}
            </div>
            <div>
              <h2
                ref={titleRef}
                tabIndex={-1}
                className="text-lg font-bold text-slate-900 focus:outline-none"
              >
                {employeeName}
              </h2>
              <p className="text-xs text-slate-500">
                {item.employee.position || 'Sin cargo'}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                {item.employee.documentId && (
                  <span>DPI {item.employee.documentId}</span>
                )}
                {item.employee.nit && <span>NIT {item.employee.nit}</span>}
                {item.employee.igssNumber && (
                  <span>IGSS {item.employee.igssNumber}</span>
                )}
                {item.employee.hireDate && (
                  <span>
                    Ingreso{' '}
                    {format(new Date(item.employee.hireDate), 'dd MMM yyyy', {
                      locale: es,
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Resumen rápido */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryBox
              label="Días"
              value={String(item.daysWorked)}
              icon={<UserIcon className="h-3.5 w-3.5" />}
            />
            <SummaryBox
              label="Devengado"
              value={formatQ(item.totalGross)}
              tone="neutral"
            />
            <SummaryBox
              label="Neto"
              value={formatQ(item.netSalary)}
              tone="success"
            />
          </div>

          {/* Devengado */}
          <Section title="Devengado">
            <Row label="Salario base" value={formatQ(item.baseSalary)} />
            <Row
              label="Bonificación incentivo (Dec. 78-89)"
              value={formatQ(item.bonusIncentive)}
            />
            {item.overtimeRegularAmount > 0 && (
              <Row
                label={`Horas extras diurnas (${formatHrs(item.overtimeRegularHours)} · +50%)`}
                value={formatQ(item.overtimeRegularAmount)}
              />
            )}
            {item.overtimeNightAmount > 0 && (
              <Row
                label={`Horas extras nocturnas (${formatHrs(item.overtimeNightHours)} · +100%)`}
                value={formatQ(item.overtimeNightAmount)}
              />
            )}
            {item.overtimeHolidayAmount > 0 && (
              <Row
                label={`Horas en día festivo (${formatHrs(item.overtimeHolidayHours)} · +100%)`}
                value={formatQ(item.overtimeHolidayAmount)}
              />
            )}
            {item.seventhDayAmount > 0 && (
              <Row
                label="Séptimo día (Art. 126 CT)"
                value={formatQ(item.seventhDayAmount)}
              />
            )}
            {item.commissions > 0 && (
              <Row label="Comisiones" value={formatQ(item.commissions)} />
            )}
            {item.otherBonuses > 0 && (
              <Row label="Otros bonos" value={formatQ(item.otherBonuses)} />
            )}
            <Row
              label="Total devengado"
              value={formatQ(item.totalGross)}
              strong
            />
          </Section>

          {/* Deducciones */}
          <Section title="Deducciones del empleado">
            <Row
              label="IGSS laboral (4.83%)"
              value={`- ${formatQ(item.igssLaboral)}`}
              valueClassName="text-rose-600"
            />
            {item.isr > 0 && (
              <Row
                label="ISR retenido"
                value={`- ${formatQ(item.isr)}`}
                valueClassName="text-rose-600"
              />
            )}
            {item.loanDeduction > 0 && (
              <Row
                label="Cuota préstamo"
                value={`- ${formatQ(item.loanDeduction)}`}
                valueClassName="text-rose-600"
              />
            )}
            {item.otherDeductions > 0 && (
              <Row
                label="Otras deducciones"
                value={`- ${formatQ(item.otherDeductions)}`}
                valueClassName="text-rose-600"
              />
            )}
            <Row
              label="Total deducciones"
              value={`- ${formatQ(item.totalDeductions)}`}
              valueClassName="text-rose-600"
              strong
            />
            <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">
                Neto a pagar
              </span>
              <span className="text-lg font-bold text-emerald-700">
                {formatQ(item.netSalary)}
              </span>
            </div>
          </Section>

          {/* Provisiones patronales */}
          {(item.bono14Provision > 0 ||
            item.aguinaldoProvision > 0 ||
            item.vacacionesProvision > 0 ||
            item.indemnizacionProvision > 0) && (
            <Section
              title="Provisiones (costo patronal, no descuentan al empleado)"
              tone="muted"
            >
              {item.bono14Provision > 0 && (
                <Row
                  label="Bono 14 (1/12)"
                  value={formatQ(item.bono14Provision)}
                />
              )}
              {item.aguinaldoProvision > 0 && (
                <Row
                  label="Aguinaldo (1/12)"
                  value={formatQ(item.aguinaldoProvision)}
                />
              )}
              {item.vacacionesProvision > 0 && (
                <Row
                  label="Vacaciones (15 días / 24)"
                  value={formatQ(item.vacacionesProvision)}
                />
              )}
              {item.indemnizacionProvision > 0 && (
                <Row
                  label="Indemnización (1 mes / 12)"
                  value={formatQ(item.indemnizacionProvision)}
                />
              )}
            </Section>
          )}

          {/* Cargas patronales */}
          {item.totalCostoPatronal > 0 && (
            <Section title="Cargas patronales" tone="muted">
              <Row
                label="IGSS patronal (10.67%)"
                value={formatQ(item.igssPatronal)}
              />
              <Row label="IRTRA (1%)" value={formatQ(item.irtra)} />
              <Row label="INTECAP (1%)" value={formatQ(item.intecap)} />
              <Row
                label="Total carga patronal"
                value={formatQ(item.totalCostoPatronal)}
                strong
              />
            </Section>
          )}

          {/* Observaciones */}
          {item.notes && (
            <Section title="Observaciones" tone="muted">
              <p className="text-sm leading-relaxed text-slate-600">
                {item.notes}
              </p>
            </Section>
          )}
        </div>

        {/* Footer / acciones */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          {payrollStatus === 'DRAFT' && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              aria-label="Editar boleta"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
          )}
          {onDownloadPdf && (
            <button
              type="button"
              onClick={() => onDownloadPdf(item)}
              aria-label="Descargar boleta en PDF"
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Descargar PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  tone = 'normal',
}: {
  title: string;
  children: ReactNode;
  tone?: 'normal' | 'muted';
}) {
  return (
    <div>
      <h3
        className={`mb-2 text-[10px] font-bold uppercase tracking-widest ${
          tone === 'muted' ? 'text-slate-400' : 'text-slate-500'
        }`}
      >
        {title}
      </h3>
      <div className="space-y-1.5 rounded-2xl border border-slate-100 bg-white p-4">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClassName = 'text-slate-900',
  strong = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 ${
        strong
          ? 'border-t border-slate-100 pt-2 text-sm font-bold'
          : 'text-[13px]'
      }`}
    >
      <span className={strong ? 'text-slate-700' : 'text-slate-600'}>
        {label}
      </span>
      <span
        className={`tabular-nums ${strong ? 'font-bold' : 'font-medium'} ${valueClassName}`}
      >
        {value}
      </span>
    </div>
  );
}

function SummaryBox({
  label,
  value,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'success';
  icon?: ReactNode;
}) {
  const valueColor =
    tone === 'success' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
      <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">
        {icon}
        {label}
      </span>
      <span className={`mt-0.5 block text-sm font-bold ${valueColor}`}>
        {value}
      </span>
    </div>
  );
}
