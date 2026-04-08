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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <form onSubmit={handleSubmit} className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center shrink-0 shadow-inner">
              <Lock className="w-7 h-7" />
            </div>
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-red-500 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <h2 className="text-2xl font-black text-slate-800 mb-2">Cerrar Turno de Caja</h2>
          <p className="text-sm font-medium text-slate-500 mb-6 leading-relaxed">
            Ingresa el monto exacto de billetes y monedas con el que estás dejando la caja antes de irte. El sistema se bloqueará al confirmar.
          </p>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 text-red-600 text-[13px] font-bold rounded-xl flex items-center gap-2 border border-red-100">
              <AlertCircle className="w-5 h-5 shrink-0"/> {error}
            </div>
          )}

          <div className="mb-6 relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl">Q</span>
            <input 
              type="number"
              step="0.01"
              min="0"
              required
              autoFocus
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-200 text-3xl font-black text-slate-800 rounded-2xl focus:border-red-500 focus:bg-white outline-none transition-all"
              placeholder="0.00"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting || !closingBalance}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-95"
          >
            {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Confirmar Cierre y Bloquear'}
          </button>
        </form>
      </div>
    </div>
  );
}
