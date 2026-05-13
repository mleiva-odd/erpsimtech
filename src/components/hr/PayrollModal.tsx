'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

interface PayrollModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function PayrollModal({ onClose, onSuccess }: PayrollModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    payrollType: 'REGULAR' as 'REGULAR' | 'BONO14' | 'AGUINALDO' | 'INDEMNIZACION' | 'EXTRAORDINARIA',
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/hr/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          startDate: formData.startDate,
          endDate: formData.endDate,
          payrollType: formData.payrollType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error al generar planilla');
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
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200">
        <div className="p-8 pb-4 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Generar Nueva Planilla</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cálculo de Nómina</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Tipo de Planilla</label>
            <select
              required
              value={formData.payrollType}
              onChange={e => setFormData({...formData, payrollType: e.target.value as typeof formData.payrollType})}
              className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800"
            >
              <option value="REGULAR">Regular (mensual / quincenal)</option>
              <option value="BONO14">Bono 14</option>
              <option value="AGUINALDO">Aguinaldo</option>
              <option value="INDEMNIZACION">Indemnización</option>
              <option value="EXTRAORDINARIA">Extraordinaria</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Nombre Identificador</label>
            <input
              required
              type="text"
              placeholder="Ej: Planilla Mayo 2026 - 1ra Quincena"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Fecha Inicio</label>
              <input 
                required 
                type="date" 
                value={formData.startDate} 
                onChange={e => setFormData({...formData, startDate: e.target.value})} 
                className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Fecha Fin</label>
              <input 
                required 
                type="date" 
                value={formData.endDate} 
                onChange={e => setFormData({...formData, endDate: e.target.value})} 
                className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" 
              />
            </div>
          </div>

          <div className="pt-4 flex flex-col gap-4">
            {error && <p className="text-rose-500 text-xs font-bold text-center">{error}</p>}
            <button 
              disabled={isLoading}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl shadow-slate-500/20 hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Generar y Calcular'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
