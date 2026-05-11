'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Save, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface PayrollEmployee {
  firstName: string;
  lastName: string;
  position: string;
}

interface PayrollItemData {
  id: string;
  baseSalary: number | string;
  bonusIncentive: number | string;
  otherBonuses: number | string;
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
  totalGross: number | string;
  totalDeductions: number | string;
  totalNet: number | string;
  items: PayrollItemData[];
}

interface PayrollItemUpdatePayload {
  otherBonuses: number;
  otherDeductions: number;
  netSalary: number;
}

interface ConfirmConfig {
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
}

export default function PayrollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [payroll, setPayroll] = useState<PayrollData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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

  useEffect(() => {
    void fetchPayroll();
  }, [fetchPayroll]);

  const handleUpdateItem = async (itemId: string, data: PayrollItemUpdatePayload) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/hr/payroll-items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) void fetchPayroll();
    } catch (e) {
      alert('Error al guardar');
    } finally {
      setIsSaving(false);
      setEditingItem(null);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/hr/payroll/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        void fetchPayroll();
        toast({ title: 'Estado Actualizado', description: `La planilla ahora está en estado ${newStatus}.` });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo actualizar el estado.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
      setConfirmConfig(null);
    }
  };

  if (isLoading) return <div className="p-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-500 opacity-20" /></div>;
  if (!payroll) return <div className="p-20 text-center text-slate-500">Planilla no encontrada</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{payroll.name}</h1>
            <p className="text-xs font-medium text-slate-500">
              Periodo: {format(new Date(payroll.startDate), 'dd/MM/yyyy')} - {format(new Date(payroll.endDate), 'dd/MM/yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {payroll.status === 'DRAFT' && (
            <button 
              onClick={() => setConfirmConfig({
                title: '¿Aprobar Planilla?',
                message: 'Una vez aprobada, los montos ya no podrán editarse.',
                confirmText: 'Aprobar Ahora',
                onConfirm: () => handleStatusChange('APPROVED')
              })}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all"
            >
              Aprobar Planilla
            </button>
          )}
          {payroll.status === 'APPROVED' && (
            <button 
              onClick={() => setConfirmConfig({
                title: '¿Marcar como Pagada?',
                message: 'Esta acción confirmará el pago de todos los colaboradores.',
                confirmText: 'Confirmar Pago',
                onConfirm: () => handleStatusChange('PAID')
              })}
              className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all"
            >
              Marcar como Pagada
            </button>
          )}
          <button className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all">
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Resumen Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Devengado</span>
          <span className="text-2xl font-bold text-slate-900">Q{Number(payroll.totalGross).toLocaleString()}</span>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Deducciones</span>
          <span className="text-2xl font-bold text-rose-500">Q{Number(payroll.totalDeductions).toLocaleString()}</span>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm border-b-4 border-b-emerald-500">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Total Líquido</span>
          <span className="text-2xl font-bold text-emerald-600">Q{Number(payroll.totalNet).toLocaleString()}</span>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Colaborador</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Salario Base</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bonos</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Deducciones (IGSS/ISR)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Neto a Recibir</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {payroll.items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                        {item.employee.firstName.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{item.employee.firstName} {item.employee.lastName}</p>
                        <p className="text-[10px] text-slate-500 font-medium">{item.employee.position}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-700 text-sm">Q{Number(item.baseSalary).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-slate-600">Leyes: Q{Number(item.bonusIncentive).toLocaleString()}</span>
                      {Number(item.otherBonuses) > 0 && <span className="text-xs text-emerald-600 font-bold">Extra: Q{Number(item.otherBonuses).toLocaleString()}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5 text-xs text-slate-600">
                      <span>IGSS: Q{Number(item.igss).toLocaleString()}</span>
                      {Number(item.isr) > 0 && <span>ISR: Q{Number(item.isr).toLocaleString()}</span>}
                      {Number(item.otherDeductions) > 0 && <span className="text-rose-500 font-bold">Otros: Q{Number(item.otherDeductions).toLocaleString()}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-bold text-slate-900">Q{Number(item.netSalary).toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {payroll.status === 'DRAFT' && (
                      <button 
                        onClick={() => setEditingItem(item)}
                        className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simple Edit Modal for Item */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8">
            <h3 className="text-xl font-bold text-slate-900 mb-6">Ajustar Pago: {editingItem.employee.firstName}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Bonos Extras / Comisiones</label>
                <input 
                  type="number" 
                  defaultValue={Number(editingItem.otherBonuses)} 
                  id="extraBonuses"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-50 outline-none" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Otras Deducciones (Faltas, Préstamos)</label>
                <input 
                  type="number" 
                  defaultValue={Number(editingItem.otherDeductions)} 
                  id="extraDeds"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-50 outline-none" 
                />
              </div>
              <div className="pt-6 flex gap-3">
                <button onClick={() => setEditingItem(null)} className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl">Cancelar</button>
                <button 
                  onClick={() => {
                    const bonus = parseFloat((document.getElementById('extraBonuses') as HTMLInputElement).value) || 0;
                    const ded = parseFloat((document.getElementById('extraDeds') as HTMLInputElement).value) || 0;
                    const base = Number(editingItem.baseSalary);
                    const net = base + Number(editingItem.bonusIncentive) + bonus - Number(editingItem.igss) - Number(editingItem.isr) - ded;
                    handleUpdateItem(editingItem.id, { otherBonuses: bonus, otherDeductions: ded, netSalary: net });
                  }}
                  className="flex-1 py-3 font-bold text-white bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmConfig && (
        <ConfirmModal
          isOpen={!!confirmConfig}
          onClose={() => setConfirmConfig(null)}
          onConfirm={confirmConfig.onConfirm}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmText={confirmConfig.confirmText}
          isLoading={isSaving}
        />
      )}
    </div>
  );
}
