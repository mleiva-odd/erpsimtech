'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, User, Building2, Wallet, Calendar } from 'lucide-react';

interface BranchOption {
  id: string;
  name: string;
}

interface EditableEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  documentId?: string | null;
  nit?: string | null;
  address?: string | null;
  position?: string | null;
  baseSalary?: number | string | null;
  hireDate?: string | null;
  branchId?: string | null;
  bankAccount?: string | null;
  bankName?: string | null;
}

interface EmployeeModalProps {
  employee: EditableEmployee | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EmployeeModal({ employee, onClose, onSuccess }: EmployeeModalProps) {
  const [formData, setFormData] = useState({
    firstName: employee?.firstName || '',
    lastName: employee?.lastName || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    documentId: employee?.documentId || '',
    nit: employee?.nit || '',
    address: employee?.address || '',
    position: employee?.position || '',
    baseSalary: employee?.baseSalary || 0,
    hireDate: employee?.hireDate ? new Date(employee.hireDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    branchId: employee?.branchId || '',
    bankAccount: employee?.bankAccount || '',
    bankName: employee?.bankName || '',
  });

  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/branches')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setBranches(data);
      })
      .catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const url = employee ? `/api/hr/employees/${employee.id}` : '/api/hr/employees';
      const method = employee ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error al guardar');
        return;
      }
      onSuccess();
    } catch (e) {
      setError('Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[95vh] border border-slate-100">
        <div className="px-8 pt-8 pb-4 flex justify-between items-start bg-slate-50/50 border-b border-slate-100">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {employee ? 'Editar Expediente' : 'Nueva Ficha de Empleado'}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Gestión de Recursos Humanos</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-8 py-8 custom-scrollbar flex-1">
          <form id="employeeForm" onSubmit={handleSubmit} className="space-y-10">
            {/* Seccion 1: Identidad */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800">Identidad Personal</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Nombres *</label>
                  <input required type="text" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Apellidos *</label>
                  <input required type="text" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Documento de Identidad (DPI)</label>
                  <input type="text" value={formData.documentId} onChange={e => setFormData({...formData, documentId: e.target.value})} className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">NIT</label>
                  <input type="text" value={formData.nit} onChange={e => setFormData({...formData, nit: e.target.value})} className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" />
                </div>
              </div>
            </div>

            {/* Seccion 2: Laboral */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800">Información Laboral</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Puesto / Cargo</label>
                  <input type="text" value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})} placeholder="Ej: Gerente de Ventas" className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Sucursal de Asignación</label>
                  <select value={formData.branchId} onChange={e => setFormData({...formData, branchId: e.target.value})} className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800">
                    <option value="">Seleccionar sucursal...</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Fecha de Ingreso</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="date" value={formData.hireDate} onChange={e => setFormData({...formData, hireDate: e.target.value})} className="w-full pl-12 pr-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" />
                  </div>
                </div>
              </div>
            </div>

            {/* Seccion 3: Nómina */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                  <Wallet className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-800">Compensación y Bancos</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Salario Base (Mensual) *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">Q</span>
                    <input required type="number" step="0.01" value={formData.baseSalary} onChange={e => setFormData({...formData, baseSalary: parseFloat(e.target.value)})} className="w-full pl-10 pr-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Banco</label>
                    <input type="text" value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} placeholder="Ej: Banrural" className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">No. Cuenta</label>
                    <input type="text" value={formData.bankAccount} onChange={e => setFormData({...formData, bankAccount: e.target.value})} className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" />
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-end items-center gap-4">
          {error && <span className="text-rose-500 text-[11px] font-bold uppercase mr-auto">{error}</span>}
          <button type="button" onClick={onClose} className="px-6 py-3 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-all text-sm">
            Cancelar
          </button>
          <button type="submit" form="employeeForm" disabled={isLoading} className="flex items-center gap-2.5 px-10 py-3.5 bg-slate-900 hover:bg-slate-800 shadow-xl shadow-slate-500/20 text-white rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-50 text-sm">
            {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : 'Guardar Expediente'}
          </button>
        </div>
      </div>
    </div>
  );
}
