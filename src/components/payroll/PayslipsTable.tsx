'use client';

/**
 * Fase 22c-3 · PayslipsTable.
 *
 * Wrapper de DataTable con columnas estándar para listar los PayrollItems
 * de un periodo. Incluye:
 *   - Columnas: Empleado (avatar+nombre+cargo), Días, Base, Bonificación,
 *     Bono14 prov., Aguinaldo prov., Devengado, IGSS, ISR, Otros, Neto.
 *   - cardRenderer móvil con desglose colapsable (devengado + deducciones).
 *   - Botón "Descargar PDF" por fila.
 *   - Botón "Editar" por fila (solo si payrollStatus === 'DRAFT').
 *   - EmptyState integrado cuando no hay items (= aún no se corrió la planilla).
 *
 * Toda la lógica de interacción se delega al padre via callbacks.
 */

import { useState, type MouseEvent } from 'react';
import {
  Download,
  Pencil,
  ChevronDown,
  Receipt,
  Users,
  Loader2,
} from 'lucide-react';
import {
  DataTable,
  type DataTableColumn,
} from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';

export interface PayslipRow {
  id: string;
  employeeId: string;
  daysWorked: number;
  baseSalary: number;
  bonusIncentive: number;
  otherBonuses: number;
  commissions: number;
  bono14Provision: number;
  aguinaldoProvision: number;
  vacacionesProvision: number;
  totalGross: number;
  igssLaboral: number;
  isr: number;
  loanDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  notes?: string | null;
  employee: {
    firstName: string;
    lastName: string;
    position?: string | null;
  };
}

interface PayslipsTableProps {
  payslips: PayslipRow[];
  loading?: boolean;
  payrollStatus: 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED';
  /** Click en fila → abrir drawer detalle. */
  onSelect?: (row: PayslipRow) => void;
  /** Editar item (sólo DRAFT). */
  onEdit?: (row: PayslipRow) => void;
  /** Descargar PDF. */
  onDownloadPdf?: (row: PayslipRow) => void;
  /** Acción para correr la planilla si está vacía. */
  onRunPayroll?: () => void;
  /** Indica si una acción global está en curso (deshabilita botones). */
  isBusy?: boolean;
}

function formatQ(n: number): string {
  return `Q${(Number(n) || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function PayslipsTable({
  payslips,
  loading = false,
  payrollStatus,
  onSelect,
  onEdit,
  onDownloadPdf,
  onRunPayroll,
  isBusy = false,
}: PayslipsTableProps) {
  const canEdit = payrollStatus === 'DRAFT';

  const columns: DataTableColumn<PayslipRow>[] = [
    {
      key: 'employee',
      header: 'Colaborador',
      mobilePriority: 'title',
      accessor: (r) => (
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-xs font-bold text-blue-600"
            aria-hidden="true"
          >
            {r.employee.firstName.charAt(0)}
            {r.employee.lastName.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              {r.employee.firstName} {r.employee.lastName}
            </p>
            <p className="text-[10px] font-medium text-slate-500">
              {r.employee.position || 'Sin cargo'}
            </p>
          </div>
        </div>
      ),
      exportValue: (r) => `${r.employee.firstName} ${r.employee.lastName}`,
    },
    {
      key: 'daysWorked',
      header: 'Días',
      accessor: (r) => (
        <span className="text-sm text-slate-700">{r.daysWorked}</span>
      ),
      exportValue: (r) => String(r.daysWorked),
    },
    {
      key: 'baseSalary',
      header: 'Base',
      accessor: (r) => (
        <span className="text-sm tabular-nums text-slate-700">
          {formatQ(r.baseSalary)}
        </span>
      ),
      exportValue: (r) => formatQ(r.baseSalary),
    },
    {
      key: 'bonusIncentive',
      header: 'Bonificación',
      accessor: (r) => (
        <span className="text-sm tabular-nums text-slate-700">
          {formatQ(r.bonusIncentive)}
        </span>
      ),
      exportValue: (r) => formatQ(r.bonusIncentive),
    },
    {
      key: 'bono14',
      header: 'Bono 14',
      accessor: (r) => (
        <span className="text-xs tabular-nums text-slate-500">
          {formatQ(r.bono14Provision)}
        </span>
      ),
      exportValue: (r) => formatQ(r.bono14Provision),
    },
    {
      key: 'aguinaldo',
      header: 'Aguinaldo',
      accessor: (r) => (
        <span className="text-xs tabular-nums text-slate-500">
          {formatQ(r.aguinaldoProvision)}
        </span>
      ),
      exportValue: (r) => formatQ(r.aguinaldoProvision),
    },
    {
      key: 'totalGross',
      header: 'Devengado',
      accessor: (r) => (
        <span className="text-sm font-bold tabular-nums text-slate-800">
          {formatQ(r.totalGross)}
        </span>
      ),
      exportValue: (r) => formatQ(r.totalGross),
    },
    {
      key: 'igss',
      header: 'IGSS',
      accessor: (r) => (
        <span className="text-sm tabular-nums text-rose-500">
          {formatQ(r.igssLaboral)}
        </span>
      ),
      exportValue: (r) => formatQ(r.igssLaboral),
    },
    {
      key: 'isr',
      header: 'ISR',
      accessor: (r) => (
        <span className="text-sm tabular-nums text-rose-500">
          {formatQ(r.isr)}
        </span>
      ),
      exportValue: (r) => formatQ(r.isr),
    },
    {
      key: 'otros',
      header: 'Otros',
      accessor: (r) => (
        <span className="text-xs tabular-nums text-slate-500">
          {formatQ(Number(r.loanDeduction) + Number(r.otherDeductions))}
        </span>
      ),
      exportValue: (r) =>
        formatQ(Number(r.loanDeduction) + Number(r.otherDeductions)),
    },
    {
      key: 'netSalary',
      header: 'Neto',
      mobilePriority: 'highlight',
      accessor: (r) => (
        <span className="text-sm font-bold tabular-nums text-emerald-600">
          {formatQ(r.netSalary)}
        </span>
      ),
      exportValue: (r) => formatQ(r.netSalary),
    },
    {
      key: 'actions',
      header: '',
      accessor: (r) => (
        <RowActions
          row={r}
          canEdit={canEdit}
          isBusy={isBusy}
          onEdit={onEdit}
          onDownloadPdf={onDownloadPdf}
        />
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={payslips}
      loading={loading}
      getRowId={(r) => r.id}
      onRowClick={onSelect}
      enableCsvExport
      enablePdfExport
      exportFileName="payslips"
      cardRenderer={(r) => (
        <PayslipMobileCard
          row={r}
          canEdit={canEdit}
          isBusy={isBusy}
          onSelect={onSelect}
          onEdit={onEdit}
          onDownloadPdf={onDownloadPdf}
        />
      )}
      empty={
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title="Aún no se ha corrido la planilla"
          description="Genera los recibos del periodo para todos los empleados activos. Podrás revisarlos y ajustarlos antes de aprobar."
          action={
            onRunPayroll && payrollStatus === 'DRAFT' ? (
              <button
                type="button"
                onClick={onRunPayroll}
                disabled={isBusy}
                aria-label="Correr planilla ahora"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 disabled:opacity-50"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Receipt className="h-4 w-4" />
                )}
                Correr planilla ahora
              </button>
            ) : undefined
          }
        />
      }
    />
  );
}

function RowActions({
  row,
  canEdit,
  isBusy,
  onEdit,
  onDownloadPdf,
}: {
  row: PayslipRow;
  canEdit: boolean;
  isBusy: boolean;
  onEdit?: (r: PayslipRow) => void;
  onDownloadPdf?: (r: PayslipRow) => void;
}) {
  const handleStop = (e: MouseEvent) => e.stopPropagation();
  return (
    <div className="flex items-center justify-end gap-1" onClick={handleStop}>
      {canEdit && onEdit && (
        <button
          type="button"
          onClick={() => onEdit(row)}
          disabled={isBusy}
          aria-label={`Editar boleta de ${row.employee.firstName} ${row.employee.lastName}`}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
          title="Editar"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
      {onDownloadPdf && (
        <button
          type="button"
          onClick={() => onDownloadPdf(row)}
          aria-label={`Descargar boleta PDF de ${row.employee.firstName} ${row.employee.lastName}`}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
          title="Descargar PDF"
        >
          <Download className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function PayslipMobileCard({
  row,
  canEdit,
  isBusy,
  onSelect,
  onEdit,
  onDownloadPdf,
}: {
  row: PayslipRow;
  canEdit: boolean;
  isBusy: boolean;
  onSelect?: (r: PayslipRow) => void;
  onEdit?: (r: PayslipRow) => void;
  onDownloadPdf?: (r: PayslipRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const handleStop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
      onClick={() => onSelect?.(row)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-600">
            {row.employee.firstName.charAt(0)}
            {row.employee.lastName.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              {row.employee.firstName} {row.employee.lastName}
            </p>
            <p className="text-[10px] font-medium text-slate-500">
              {row.employee.position || 'Sin cargo'} · {row.daysWorked} días
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">
            Neto
          </span>
          <span className="block text-base font-bold text-emerald-600 tabular-nums">
            {formatQ(row.netSalary)}
          </span>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Ocultar desglose' : 'Mostrar desglose'}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 transition hover:bg-slate-100"
      >
        <span>Desglose</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-2 rounded-xl bg-slate-50/50 p-3 text-xs">
          <MobileRow label="Base" value={formatQ(row.baseSalary)} />
          <MobileRow
            label="Bonificación"
            value={formatQ(row.bonusIncentive)}
          />
          {row.otherBonuses > 0 && (
            <MobileRow label="Otros bonos" value={formatQ(row.otherBonuses)} />
          )}
          {row.commissions > 0 && (
            <MobileRow label="Comisiones" value={formatQ(row.commissions)} />
          )}
          <MobileRow
            label="Devengado"
            value={formatQ(row.totalGross)}
            strong
          />
          <MobileRow
            label="IGSS (4.83%)"
            value={`- ${formatQ(row.igssLaboral)}`}
            tone="danger"
          />
          {row.isr > 0 && (
            <MobileRow
              label="ISR"
              value={`- ${formatQ(row.isr)}`}
              tone="danger"
            />
          )}
          {row.loanDeduction > 0 && (
            <MobileRow
              label="Préstamo"
              value={`- ${formatQ(row.loanDeduction)}`}
              tone="danger"
            />
          )}
          {row.otherDeductions > 0 && (
            <MobileRow
              label="Otras ded."
              value={`- ${formatQ(row.otherDeductions)}`}
              tone="danger"
            />
          )}
          {row.bono14Provision > 0 && (
            <MobileRow
              label="Provisión Bono 14"
              value={formatQ(row.bono14Provision)}
              tone="muted"
            />
          )}
          {row.aguinaldoProvision > 0 && (
            <MobileRow
              label="Provisión Aguinaldo"
              value={formatQ(row.aguinaldoProvision)}
              tone="muted"
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2" onClick={handleStop}>
        {canEdit && onEdit && (
          <button
            type="button"
            onClick={() => onEdit(row)}
            disabled={isBusy}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </button>
        )}
        {onDownloadPdf && (
          <button
            type="button"
            onClick={() => onDownloadPdf(row)}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
        )}
      </div>
    </div>
  );
}

function MobileRow({
  label,
  value,
  tone = 'neutral',
  strong = false,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'danger' | 'muted';
  strong?: boolean;
}) {
  const color =
    tone === 'danger'
      ? 'text-rose-500'
      : tone === 'muted'
        ? 'text-slate-400'
        : 'text-slate-800';
  return (
    <div className="flex items-center justify-between">
      <span
        className={`${strong ? 'font-bold text-slate-700' : 'text-slate-500'}`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${strong ? 'font-bold' : 'font-medium'} ${color}`}
      >
        {value}
      </span>
    </div>
  );
}
