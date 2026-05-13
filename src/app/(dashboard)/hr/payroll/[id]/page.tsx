'use client';

/**
 * Fase 22b · Payroll detail (Fase 18).
 *
 * Editor de planilla con acciones por estado:
 *  - DRAFT: editar items (otherBonuses / commissions / otherDeductions),
 *           Recalcular, Aprobar.
 *  - APPROVED: Pagar (genera asiento contable).
 *  - Cualquiera: exportar IGSS CSV, planilla CSV, boleta PDF por empleado.
 */

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Download, Save, Loader2, RefreshCw, FileSpreadsheet,
  Receipt, BadgeCheck, Wallet,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface PayrollEmployee {
  id?: string;
  firstName: string;
  lastName: string;
  position: string;
}

interface PayrollItemData {
  id: string;
  employeeId?: string;
  baseSalary: number | string;
  bonusIncentive: number | string;
  otherBonuses: number | string;
  commissions?: number | string;
  igss: number | string;
  isr: number | string;
  otherDeductions: number | string;
  netSalary: number | string;
  employee: PayrollEmployee;
}

interface PayrollData {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  payrollType?: string;
  totalGross: number | string;
  totalDeductions: number | string;
  totalNet: number | string;
  items: PayrollItemData[];
}

interface ConfirmConfig {
  title: string;
  message: string;
  confirmText: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
}

function formatQ(n: number | string): string {
  return `Q${Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export default function PayrollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [payroll, setPayroll] = useState<PayrollData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [editingItem, setEditingItem] = useState<PayrollItemData | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);

  const fetchPayroll = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/hr/payroll/${id}`);
      const data = await res.json();
      if (res.ok) setPayroll(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { void fetchPayroll(); }, [fetchPayroll]);

  const callAction = async (path: string, label: string) => {
    setIsBusy(true);
    try {
      const res = await fetch(path, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Operación fallida');
      toast({ tone: 'success', message: `${label} OK.` });
      void fetchPayroll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      toast({ tone: 'error', message: msg });
    } finally {
      setIsBusy(false);
      setConfirmConfig(null);
    }
  };

  const handleUpdateItem = async (
    itemId: string,
    data: { otherBonuses: number; commissions: number; otherDeductions: number; netSalary: number },
  ) => {
    setIsBusy(true);
    try {
      const res = await fetch(`/api/hr/payroll-items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Error al guardar');
      void fetchPayroll();
      toast({ tone: 'success', message: 'Item actualizado.' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      toast({ tone: 'error', message: msg });
    } finally {
      setIsBusy(false);
      setEditingItem(null);
    }
  };

  const exportIgss = async () => {
    try {
      await downloadBlob(`/api/hr/payroll/${id}/report/igss`, `igss_${id}.csv`);
    } catch {
      toast({ tone: 'error', message: 'No se pudo exportar IGSS.' });
    }
  };

  const exportCsv = async () => {
    try {
      await downloadBlob(`/api/hr/payroll/${id}/report/csv`, `planilla_${id}.csv`);
    } catch {
      toast({ tone: 'error', message: 'No se pudo exportar planilla.' });
    }
  };

  const downloadPayslip = async (employeeId: string, employeeName: string) => {
    try {
      await downloadBlob(
        `/api/hr/payroll/${id}/payslip/${employeeId}`,
        `boleta_${employeeName.replace(/\s+/g, '_')}.pdf`,
      );
    } catch {
      toast({ tone: 'error', message: 'No se pudo descargar la boleta.' });
    }
  };

  if (isLoading) {
    return (
      <div className="p-20 text-center">
        <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-500 opacity-30" />
      </div>
    );
  }
  if (!payroll) {
    return <div className="p-20 text-center text-slate-500">Planilla no encontrada</div>;
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-600" /> {payroll.name}
            </h1>
            <p className="text-xs font-medium text-slate-500">
              {payroll.payrollType || 'REGULAR'} · {format(new Date(payroll.startDate), 'dd/MM/yyyy')} -{' '}
              {format(new Date(payroll.endDate), 'dd/MM/yyyy')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {payroll.status === 'DRAFT' && (
            <button
              onClick={() =>
                setConfirmConfig({
                  title: '¿Recalcular planilla?',
                  message: 'Se recomputarán todos los items desde los empleados activos. Tus ajustes manuales se perderán.',
                  confirmText: 'Recalcular',
                  variant: 'warning',
                  onConfirm: () => callAction(`/api/hr/payroll/${id}/recalculate`, 'Recalculada'),
                })
              }
              disabled={isBusy}
              className="px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-sm font-bold hover:bg-amber-100 transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" /> Recalcular
            </button>
          )}
          {payroll.status === 'DRAFT' && (
            <button
              onClick={() =>
                setConfirmConfig({
                  title: '¿Aprobar planilla?',
                  message: 'Una vez aprobada, los montos quedan inmutables.',
                  confirmText: 'Aprobar',
                  variant: 'info',
                  onConfirm: () => callAction(`/api/hr/payroll/${id}/approve`, 'Aprobada'),
                })
              }
              disabled={isBusy}
              className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 hover:bg-blue-700 transition flex items-center gap-1.5"
            >
              <BadgeCheck className="w-4 h-4" /> Aprobar
            </button>
          )}
          {payroll.status === 'APPROVED' && (
            <button
              onClick={() =>
                setConfirmConfig({
                  title: '¿Marcar como pagada?',
                  message: 'Se generará el asiento contable correspondiente. Esta acción no se puede revertir.',
                  confirmText: 'Pagar',
                  variant: 'warning',
                  onConfirm: () => callAction(`/api/hr/payroll/${id}/pay`, 'Pagada'),
                })
              }
              disabled={isBusy}
              className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-500/20 hover:bg-emerald-700 transition flex items-center gap-1.5"
            >
              <Wallet className="w-4 h-4" /> Pagar
            </button>
          )}
          <button
            onClick={exportIgss}
            className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" /> IGSS
          </button>
          <button
            onClick={exportCsv}
            className="px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Devengado</span>
          <span className="text-2xl font-bold text-slate-900">{formatQ(payroll.totalGross)}</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Deducciones</span>
          <span className="text-2xl font-bold text-rose-500">{formatQ(payroll.totalDeductions)}</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm border-b-4 border-b-emerald-500">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Líquido</span>
          <span className="text-2xl font-bold text-emerald-600">{formatQ(payroll.totalNet)}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 text-xs text-slate-500">
                <th className="px-5 py-3 font-bold uppercase tracking-widest">Colaborador</th>
                <th className="px-5 py-3 font-bold uppercase tracking-widest">Base</th>
                <th className="px-5 py-3 font-bold uppercase tracking-widest">Bonos</th>
                <th className="px-5 py-3 font-bold uppercase tracking-widest">Deducciones</th>
                <th className="px-5 py-3 font-bold uppercase tracking-widest text-right">Neto</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {payroll.items.map((item) => {
                const employeeId = item.employeeId || item.employee.id || '';
                const employeeName = `${item.employee.firstName} ${item.employee.lastName}`;
                return (
                  <tr key={item.id} className="hover:bg-slate-50/30 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                          {item.employee.firstName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{employeeName}</p>
                          <p className="text-[10px] text-slate-500 font-medium">{item.employee.position}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-700">{formatQ(item.baseSalary)}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="text-slate-600">Ley: {formatQ(item.bonusIncentive)}</span>
                        {Number(item.otherBonuses) > 0 && (
                          <span className="text-emerald-600 font-bold">Extra: {formatQ(item.otherBonuses)}</span>
                        )}
                        {Number(item.commissions || 0) > 0 && (
                          <span className="text-indigo-600 font-bold">Comis.: {formatQ(item.commissions || 0)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-0.5 text-xs text-slate-600">
                        <span>IGSS: {formatQ(item.igss)}</span>
                        {Number(item.isr) > 0 && <span>ISR: {formatQ(item.isr)}</span>}
                        {Number(item.otherDeductions) > 0 && (
                          <span className="text-rose-500 font-bold">Otros: {formatQ(item.otherDeductions)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-slate-900">{formatQ(item.netSalary)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {payroll.status === 'DRAFT' && (
                          <button
                            onClick={() => setEditingItem(item)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Ajustar"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                        )}
                        {employeeId && (
                          <button
                            onClick={() => downloadPayslip(employeeId, employeeName)}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Boleta PDF"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {payroll.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                    No hay items en esta planilla.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={handleUpdateItem}
          isBusy={isBusy}
        />
      )}

      {confirmConfig && (
        <ConfirmModal
          isOpen
          onClose={() => setConfirmConfig(null)}
          onConfirm={confirmConfig.onConfirm}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmText={confirmConfig.confirmText}
          variant={confirmConfig.variant || 'info'}
          isLoading={isBusy}
        />
      )}
    </div>
  );
}

function EditItemModal({
  item,
  onClose,
  onSave,
  isBusy,
}: {
  item: PayrollItemData;
  onClose: () => void;
  onSave: (
    itemId: string,
    data: { otherBonuses: number; commissions: number; otherDeductions: number; netSalary: number },
  ) => void;
  isBusy: boolean;
}) {
  const [bonuses, setBonuses] = useState(Number(item.otherBonuses) || 0);
  const [commissions, setCommissions] = useState(Number(item.commissions || 0));
  const [deductions, setDeductions] = useState(Number(item.otherDeductions) || 0);

  const base = Number(item.baseSalary) || 0;
  const incentive = Number(item.bonusIncentive) || 0;
  const igss = Number(item.igss) || 0;
  const isr = Number(item.isr) || 0;
  const previewNet = base + incentive + bonuses + commissions - igss - isr - deductions;

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8">
        <h3 className="text-xl font-bold text-slate-900 mb-4">
          Ajustar pago: {item.employee.firstName} {item.employee.lastName}
        </h3>
        <div className="space-y-4">
          <FieldNum label="Bonos extras" value={bonuses} onChange={setBonuses} />
          <FieldNum label="Comisiones" value={commissions} onChange={setCommissions} />
          <FieldNum label="Otras deducciones" value={deductions} onChange={setDeductions} />
          <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Neto preview</span>
            <span className="text-lg font-bold text-emerald-600">{formatQ(previewNet)}</span>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl"
            >
              Cancelar
            </button>
            <button
              disabled={isBusy}
              onClick={() =>
                onSave(item.id, {
                  otherBonuses: bonuses,
                  commissions,
                  otherDeductions: deductions,
                  netSalary: previewNet,
                })
              }
              className="flex-1 py-3 font-bold text-white bg-blue-600 rounded-xl shadow-md shadow-blue-500/20 hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isBusy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldNum({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">{label}</label>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-50 outline-none"
      />
    </div>
  );
}
