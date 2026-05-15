'use client';

/**
 * Fase 22c-3 · Payroll period dashboard.
 *
 * Dashboard de detalle del periodo de planilla:
 *   - Header con identidad, estado, KPIs primarios y por concepto, y
 *     botones contextuales (Recalcular / Aprobar / Pagar / Cancelar).
 *   - Toolbar adicional: export IGSS, export CSV.
 *   - Tabla DataTable de payslips con cardRenderer mobile, click → drawer.
 *   - Drawer con desglose completo (Devengado, Deducciones, Provisiones,
 *     Carga patronal, Notes).
 *   - Edición inline de overrides (otherBonuses / commissions /
 *     otherDeductions) sólo si periodo en DRAFT.
 *   - EmptyState cuando no hay items con CTA "Correr planilla".
 *
 * Modelo subyacente: Payroll + PayrollItem (NO Payslip/PayrollPeriod). El
 * briefing original menciona estos nombres pero el schema real ya usa
 * Payroll/PayrollItem desde Fase 18.
 */

import { useState, useEffect, use, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Loader2,
  Save,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  PayrollPeriodHeader,
  type PayrollHeaderKpis,
  type PayrollHeaderStatus,
  type PayrollHeaderType,
} from '@/components/payroll/PayrollPeriodHeader';
import {
  PayslipsTable,
  type PayslipRow,
} from '@/components/payroll/PayslipsTable';
import {
  PayslipDetailDrawer,
  type PayslipDetailItem,
} from '@/components/payroll/PayslipDetailDrawer';

interface PayrollItemApi {
  id: string;
  employeeId: string;
  daysWorked: number;
  baseSalary: number | string;
  bonusIncentive: number | string;
  overtimeRegularHours: number | string;
  overtimeRegularAmount: number | string;
  overtimeNightHours: number | string;
  overtimeNightAmount: number | string;
  overtimeHolidayHours: number | string;
  overtimeHolidayAmount: number | string;
  seventhDayAmount: number | string;
  commissions: number | string;
  otherBonuses: number | string;
  totalGross: number | string;
  igssLaboral: number | string;
  igss?: number | string;
  isr: number | string;
  loanDeduction: number | string;
  otherDeductions: number | string;
  totalDeductions: number | string;
  netSalary: number | string;
  bono14Provision: number | string;
  aguinaldoProvision: number | string;
  indemnizacionProvision: number | string;
  vacacionesProvision: number | string;
  igssPatronal: number | string;
  irtra: number | string;
  intecap: number | string;
  totalCostoPatronal: number | string;
  notes?: string | null;
  employee: {
    firstName: string;
    lastName: string;
    position?: string | null;
    documentId?: string | null;
    nit?: string | null;
    igssNumber?: string | null;
    hireDate?: string | null;
  };
}

interface PayrollApi {
  id: string;
  name: string;
  status: PayrollHeaderStatus;
  payrollType: PayrollHeaderType;
  periodReference?: string | null;
  startDate: string;
  endDate: string;
  totalGross: number | string;
  totalDeductions: number | string;
  totalNet: number | string;
  items: PayrollItemApi[];
}

function n(v: number | string | null | undefined): number {
  return Number(v ?? 0) || 0;
}

function toPayslipRow(item: PayrollItemApi): PayslipRow {
  return {
    id: item.id,
    employeeId: item.employeeId,
    daysWorked: item.daysWorked,
    baseSalary: n(item.baseSalary),
    bonusIncentive: n(item.bonusIncentive),
    otherBonuses: n(item.otherBonuses),
    commissions: n(item.commissions),
    bono14Provision: n(item.bono14Provision),
    aguinaldoProvision: n(item.aguinaldoProvision),
    vacacionesProvision: n(item.vacacionesProvision),
    totalGross: n(item.totalGross),
    igssLaboral: n(item.igssLaboral ?? item.igss),
    isr: n(item.isr),
    loanDeduction: n(item.loanDeduction),
    otherDeductions: n(item.otherDeductions),
    totalDeductions: n(item.totalDeductions),
    netSalary: n(item.netSalary),
    notes: item.notes ?? null,
    employee: {
      firstName: item.employee.firstName,
      lastName: item.employee.lastName,
      position: item.employee.position ?? null,
    },
  };
}

function toPayslipDetail(item: PayrollItemApi): PayslipDetailItem {
  return {
    id: item.id,
    employeeId: item.employeeId,
    daysWorked: item.daysWorked,
    baseSalary: n(item.baseSalary),
    bonusIncentive: n(item.bonusIncentive),
    overtimeRegularHours: n(item.overtimeRegularHours),
    overtimeRegularAmount: n(item.overtimeRegularAmount),
    overtimeNightHours: n(item.overtimeNightHours),
    overtimeNightAmount: n(item.overtimeNightAmount),
    overtimeHolidayHours: n(item.overtimeHolidayHours),
    overtimeHolidayAmount: n(item.overtimeHolidayAmount),
    seventhDayAmount: n(item.seventhDayAmount),
    commissions: n(item.commissions),
    otherBonuses: n(item.otherBonuses),
    totalGross: n(item.totalGross),
    igssLaboral: n(item.igssLaboral ?? item.igss),
    isr: n(item.isr),
    loanDeduction: n(item.loanDeduction),
    otherDeductions: n(item.otherDeductions),
    totalDeductions: n(item.totalDeductions),
    netSalary: n(item.netSalary),
    bono14Provision: n(item.bono14Provision),
    aguinaldoProvision: n(item.aguinaldoProvision),
    indemnizacionProvision: n(item.indemnizacionProvision),
    vacacionesProvision: n(item.vacacionesProvision),
    igssPatronal: n(item.igssPatronal),
    irtra: n(item.irtra),
    intecap: n(item.intecap),
    totalCostoPatronal: n(item.totalCostoPatronal),
    notes: item.notes ?? null,
    employee: {
      firstName: item.employee.firstName,
      lastName: item.employee.lastName,
      position: item.employee.position ?? null,
      documentId: item.employee.documentId ?? null,
      nit: item.employee.nit ?? null,
      igssNumber: item.employee.igssNumber ?? null,
      hireDate: item.employee.hireDate ?? null,
    },
  };
}

async function downloadBlob(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function PayrollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [payroll, setPayroll] = useState<PayrollApi | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<PayrollItemApi | null>(null);

  const fetchPayroll = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/hr/payroll/${id}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || 'No se pudo cargar la planilla',
        );
      }
      setPayroll(data as PayrollApi);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      toast({ tone: 'error', message: msg });
    } finally {
      setIsLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void fetchPayroll();
  }, [fetchPayroll]);

  const callAction = useCallback(
    async (path: string, label: string) => {
      setIsBusy(true);
      try {
        const res = await fetch(path, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (data as { error?: string }).error || 'Operación fallida',
          );
        }
        toast({ tone: 'success', message: `${label} correctamente.` });
        await fetchPayroll();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error';
        toast({ tone: 'error', message: msg });
      } finally {
        setIsBusy(false);
      }
    },
    [toast, fetchPayroll],
  );

  const handleRecalculate = useCallback(async () => {
    const ok = await confirm({
      title: '¿Recalcular planilla?',
      message:
        'Se recomputarán todos los items desde los empleados activos. Tus ajustes manuales (bonos, comisiones, deducciones) se perderán.',
      confirmText: 'Recalcular',
      cancelText: 'Cancelar',
      tone: 'warning',
    });
    if (!ok) return;
    await callAction(`/api/hr/payroll/${id}/recalculate`, 'Planilla recalculada');
  }, [confirm, callAction, id]);

  const handleApprove = useCallback(async () => {
    const ok = await confirm({
      title: '¿Aprobar planilla?',
      message:
        'Una vez aprobada los montos quedan inmutables y queda lista para pagar.',
      confirmText: 'Aprobar',
      cancelText: 'Cancelar',
      tone: 'info',
    });
    if (!ok) return;
    await callAction(`/api/hr/payroll/${id}/approve`, 'Planilla aprobada');
  }, [confirm, callAction, id]);

  const handlePay = useCallback(async () => {
    const ok = await confirm({
      title: '¿Marcar planilla como pagada?',
      message:
        'Se generará el asiento contable y se descontarán las cuotas de préstamo aplicadas. Esta acción no se puede revertir.',
      confirmText: 'Pagar',
      cancelText: 'Cancelar',
      tone: 'warning',
    });
    if (!ok) return;
    await callAction(`/api/hr/payroll/${id}/pay`, 'Planilla pagada');
  }, [confirm, callAction, id]);

  const handleCancel = useCallback(async () => {
    const ok = await confirm({
      title: '¿Cancelar planilla?',
      message:
        'La planilla quedará en estado CANCELLED. Una planilla PAID no puede cancelarse desde aquí (requiere reversa contable).',
      confirmText: 'Cancelar planilla',
      cancelText: 'Volver',
      tone: 'danger',
    });
    if (!ok) return;
    setIsBusy(true);
    try {
      const res = await fetch(`/api/hr/payroll/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || 'No se pudo cancelar',
        );
      }
      toast({ tone: 'success', message: 'Planilla cancelada.' });
      await fetchPayroll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      toast({ tone: 'error', message: msg });
    } finally {
      setIsBusy(false);
    }
  }, [confirm, id, toast, fetchPayroll]);

  const handleSelect = useCallback((row: PayslipRow) => {
    setSelectedId(row.id);
  }, []);

  const handleEdit = useCallback(
    (row: PayslipRow) => {
      const item = payroll?.items.find((it) => it.id === row.id) ?? null;
      setEditingItem(item);
      setSelectedId(null);
    },
    [payroll],
  );

  const handleDownloadPdf = useCallback(
    async (row: PayslipRow) => {
      try {
        const filename = `boleta_${row.employee.firstName}_${row.employee.lastName}.pdf`.replace(
          /\s+/g,
          '_',
        );
        await downloadBlob(
          `/api/hr/payroll/${id}/payslip/${row.employeeId}`,
          filename,
        );
      } catch {
        toast({ tone: 'error', message: 'No se pudo descargar la boleta.' });
      }
    },
    [id, toast],
  );

  const handleDownloadDetail = useCallback(
    async (detail: PayslipDetailItem) => {
      try {
        const filename = `boleta_${detail.employee.firstName}_${detail.employee.lastName}.pdf`.replace(
          /\s+/g,
          '_',
        );
        await downloadBlob(
          `/api/hr/payroll/${id}/payslip/${detail.employeeId}`,
          filename,
        );
      } catch {
        toast({ tone: 'error', message: 'No se pudo descargar la boleta.' });
      }
    },
    [id, toast],
  );

  const handleEditFromDrawer = useCallback(
    (detail: PayslipDetailItem) => {
      const item = payroll?.items.find((it) => it.id === detail.id) ?? null;
      setEditingItem(item);
      setSelectedId(null);
    },
    [payroll],
  );

  const exportIgss = useCallback(async () => {
    try {
      await downloadBlob(`/api/hr/payroll/${id}/report/igss`, `igss_${id}.csv`);
    } catch {
      toast({ tone: 'error', message: 'No se pudo exportar IGSS.' });
    }
  }, [id, toast]);

  const exportCsv = useCallback(async () => {
    try {
      await downloadBlob(
        `/api/hr/payroll/${id}/report/csv`,
        `planilla_${id}.csv`,
      );
    } catch {
      toast({ tone: 'error', message: 'No se pudo exportar planilla.' });
    }
  }, [id, toast]);

  // Run = recalcular: para planillas DRAFT vacías es equivalente a generar
  // los items por primera vez (la API ya cubre el caso de empty + active
  // employees vía /recalculate).
  const handleRunPayroll = useCallback(async () => {
    const ok = await confirm({
      title: '¿Correr planilla?',
      message:
        'Se generarán los recibos para todos los empleados activos del periodo.',
      confirmText: 'Correr ahora',
      cancelText: 'Cancelar',
      tone: 'info',
    });
    if (!ok) return;
    await callAction(`/api/hr/payroll/${id}/recalculate`, 'Planilla generada');
  }, [confirm, callAction, id]);

  const rows = useMemo<PayslipRow[]>(
    () => (payroll?.items ?? []).map(toPayslipRow),
    [payroll?.items],
  );

  const kpis = useMemo<PayrollHeaderKpis>(() => {
    const items = payroll?.items ?? [];
    type NumericItemKey =
      | 'totalGross'
      | 'totalDeductions'
      | 'netSalary'
      | 'igssLaboral'
      | 'igssPatronal'
      | 'isr'
      | 'bono14Provision'
      | 'aguinaldoProvision'
      | 'vacacionesProvision'
      | 'totalCostoPatronal';
    const sum = (key: NumericItemKey): number =>
      items.reduce((acc, it) => acc + n(it[key]), 0);
    return {
      totalEmployees: items.length,
      totalGross: n(payroll?.totalGross) || sum('totalGross'),
      totalDeductions: n(payroll?.totalDeductions) || sum('totalDeductions'),
      totalNet: n(payroll?.totalNet) || sum('netSalary'),
      totalIgssLaboral: sum('igssLaboral'),
      totalIgssPatronal: sum('igssPatronal'),
      totalIsr: sum('isr'),
      totalBono14: sum('bono14Provision'),
      totalAguinaldo: sum('aguinaldoProvision'),
      totalVacaciones: sum('vacacionesProvision'),
      totalCostoPatronal: sum('totalCostoPatronal'),
    };
  }, [payroll]);

  const selectedDetail = useMemo<PayslipDetailItem | null>(() => {
    if (!selectedId) return null;
    const it = payroll?.items.find((x) => x.id === selectedId);
    return it ? toPayslipDetail(it) : null;
  }, [selectedId, payroll]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-20" role="status">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500 opacity-40" />
        <span className="sr-only">Cargando planilla…</span>
      </div>
    );
  }

  if (!payroll) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-8">
        <Breadcrumbs
          items={[
            { label: 'Inicio', href: '/dashboard' },
            { label: 'RRHH', href: '/hr/employees' },
            { label: 'Planillas', href: '/hr/payroll' },
            { label: 'No encontrada' },
          ]}
        />
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-sm">
          <p className="text-slate-500">Planilla no encontrada.</p>
          <button
            type="button"
            onClick={() => router.push('/hr/payroll')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al listado
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-6 p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'RRHH', href: '/hr/employees' },
          { label: 'Planillas', href: '/hr/payroll' },
          { label: payroll.name },
        ]}
      />

      <PayrollPeriodHeader
        payroll={{
          name: payroll.name,
          status: payroll.status,
          payrollType: payroll.payrollType,
          startDate: payroll.startDate,
          endDate: payroll.endDate,
          periodReference: payroll.periodReference,
        }}
        kpis={kpis}
        isBusy={isBusy}
        onRecalculate={handleRecalculate}
        onApprove={handleApprove}
        onPay={handlePay}
        onCancel={handleCancel}
        toolbarExtra={
          <>
            <button
              type="button"
              onClick={exportIgss}
              aria-label="Exportar reporte IGSS"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              IGSS
            </button>
            <button
              type="button"
              onClick={exportCsv}
              aria-label="Exportar planilla CSV"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
          </>
        }
      />

      <PayslipsTable
        payslips={rows}
        loading={isLoading}
        payrollStatus={payroll.status}
        isBusy={isBusy}
        onSelect={handleSelect}
        onEdit={handleEdit}
        onDownloadPdf={handleDownloadPdf}
        onRunPayroll={handleRunPayroll}
      />

      <PayslipDetailDrawer
        open={Boolean(selectedDetail)}
        item={selectedDetail}
        payrollStatus={payroll.status}
        onClose={() => setSelectedId(null)}
        onDownloadPdf={handleDownloadDetail}
        onEdit={handleEditFromDrawer}
      />

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            void fetchPayroll();
          }}
        />
      )}
    </div>
  );
}

/**
 * Modal de edición de overrides manuales del PayrollItem. Sólo permite
 * tocar `otherBonuses`, `commissions`, `otherDeductions` y `notes` — el
 * resto se calcula server-side. `baseSalary`, `igss`, `isr`, etc. son
 * read-only.
 */
function EditItemModal({
  item,
  onClose,
  onSaved,
}: {
  item: PayrollItemApi;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [bonuses, setBonuses] = useState<number>(n(item.otherBonuses));
  const [commissions, setCommissions] = useState<number>(n(item.commissions));
  const [deductions, setDeductions] = useState<number>(n(item.otherDeductions));
  const [notes, setNotes] = useState<string>(item.notes ?? '');
  const [saving, setSaving] = useState(false);

  const base = n(item.baseSalary);
  const incentive = n(item.bonusIncentive);
  const ot =
    n(item.overtimeRegularAmount) +
    n(item.overtimeNightAmount) +
    n(item.overtimeHolidayAmount);
  const seventh = n(item.seventhDayAmount);
  const igss = n(item.igssLaboral ?? item.igss);
  const isr = n(item.isr);
  const loan = n(item.loanDeduction);

  const previewGross = base + incentive + ot + seventh + bonuses + commissions;
  const previewDeductions = igss + isr + loan + deductions;
  const previewNet = previewGross - previewDeductions;

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/hr/payroll-items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otherBonuses: bonuses,
          commissions,
          otherDeductions: deductions,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || 'No se pudo guardar',
        );
      }
      toast({ tone: 'success', message: 'Boleta actualizada.' });
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      toast({ tone: 'error', message: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Editar boleta de ${item.employee.firstName} ${item.employee.lastName}`}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <h3 className="text-lg font-bold text-slate-900">
          Ajustar boleta
        </h3>
        <p className="text-xs text-slate-500">
          {item.employee.firstName} {item.employee.lastName}
        </p>

        <div className="mt-5 space-y-4">
          <NumberField
            label="Otros bonos (Q)"
            value={bonuses}
            onChange={setBonuses}
          />
          <NumberField
            label="Comisiones (Q)"
            value={commissions}
            onChange={setCommissions}
          />
          <NumberField
            label="Otras deducciones (Q)"
            value={deductions}
            onChange={setDeductions}
          />
          <div>
            <label
              htmlFor="payslip-notes"
              className="block text-[10px] font-bold uppercase tracking-wider text-slate-500"
            >
              Observaciones
            </label>
            <textarea
              id="payslip-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Notas internas (opcional)"
            />
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 space-y-1.5 text-xs">
            <PreviewRow label="Devengado" value={previewGross} />
            <PreviewRow
              label="Deducciones"
              value={-previewDeductions}
              tone="danger"
            />
            <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                Neto preview
              </span>
              <span className="text-lg font-bold text-emerald-600 tabular-nums">
                Q
                {previewNet.toLocaleString('es-GT', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function PreviewRow({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'danger';
}) {
  const color = tone === 'danger' ? 'text-rose-500' : 'text-slate-700';
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums font-bold ${color}`}>
        Q
        {value.toLocaleString('es-GT', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    </div>
  );
}
