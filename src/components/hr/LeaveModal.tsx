'use client';

import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface LeaveModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function LeaveModal({ onClose, onSuccess }: LeaveModalProps) {
  const [formData, setFormData] = useState({
    employeeId: '',
    type: 'VACATION',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    reason: '',
  });
  
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/hr/employees')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setEmployees(data); })
      .catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/hr/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error al solicitar');
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
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Nueva Solicitud de Permiso</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Vacaciones y Ausencias</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Colaborador</label>
            <select 
              required 
              value={formData.employeeId} 
              onChange={e => setFormData({...formData, employeeId: e.target.value})} 
              className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800 appearance-none"
            >
              <option value="">Seleccionar empleado...</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Tipo de Permiso</label>
            <select 
              value={formData.type} 
              onChange={e => setFormData({...formData, type: e.target.value})} 
              className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800 appearance-none"
            >
              <option value="VACATION">Vacaciones</option>
              <option value="SICK_LEAVE">Suspensión Médica</option>
              <option value="PERSONAL_DAYS">Asuntos Personales</option>
              <option value="OTHER">Otro</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Desde</label>
              <input 
                required 
                type="date" 
                value={formData.startDate} 
                onChange={e => setFormData({...formData, startDate: e.target.value})} 
                className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Hasta</label>
              <input 
                required 
                type="date" 
                value={formData.endDate} 
                onChange={e => setFormData({...formData, endDate: e.target.value})} 
                className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800" 
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Motivo / Justificación</label>
            <textarea 
              rows={3}
              value={formData.reason} 
              onChange={e => setFormData({...formData, reason: e.target.value})} 
              placeholder="Detalles adicionales..."
              className="w-full px-5 py-3.5 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800 resize-none" 
            />
          </div>

          <div className="pt-4 flex flex-col gap-4">
            {error && <p className="text-rose-500 text-xs font-bold text-center">{error}</p>}
            <button 
              disabled={isLoading}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl shadow-slate-500/20 hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Registrar Solicitud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
