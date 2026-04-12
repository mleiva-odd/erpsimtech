'use client';

import { useState } from 'react';
import { Lock, X, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export function CloseRegisterModal({ onClose, onSuccess }: Props) {
  const [closingBalance, setClosingBalance] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingBalance) return;
    
    setIsSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/cash-register', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingBalance: parseFloat(closingBalance) })
      });
      if (res.ok) {
        onSuccess();
      } else {
         const data = await res.json();
         setError(data.error || 'Error al cerrar caja');
      }
    } catch(e) {
      setError('Error de conexión con el banco central');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300">
        <form onSubmit={handleSubmit} className="p-8">
          <div className="flex justify-between items-start mb-8">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
              <Lock className="w-8 h-8" />
            </div>
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600 rounded-full transition-all">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Cierre de Caja</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8 leading-relaxed">
            Reporte de Efectivo y Bloqueo de Terminal
          </p>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 text-rose-600 text-[11px] font-bold uppercase tracking-wider rounded-2xl flex items-center gap-2 border border-rose-100">
              <AlertCircle className="w-5 h-5 shrink-0"/> {error}
            </div>
          )}

          <div className="mb-8 relative">
            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-2xl">Q</span>
            <input 
              type="number"
              step="0.01"
              min="0"
              required
              autoFocus
              className="w-full pl-14 pr-6 py-5 bg-slate-50 border-2 border-slate-100 text-4xl font-bold text-slate-900 rounded-2xl focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 outline-none transition-all tracking-tighter"
              placeholder="0.00"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting || !closingBalance}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white py-4.5 rounded-2xl font-bold text-sm uppercase tracking-widest shadow-xl shadow-rose-600/20 flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:grayscale"
          >
            {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Confirmar y Bloquear'}
          </button>
        </form>
      </div>
    </div>
  );
}
