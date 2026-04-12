'use client';

import { useState } from 'react';
import { X, Wallet, Loader2, ArrowDownRight, ArrowUpRight } from 'lucide-react';

interface ExpenseModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ExpenseModal({ onClose, onSuccess }: ExpenseModalProps) {
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    type: 'EXPENSE',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(formData.amount) <= 0) return alert('El monto no puede ser cero');

    setIsLoading(true);
    try {
      const res = await fetch('/api/pos/expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(formData.amount),
          description: formData.description,
          type: formData.type
        }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        const error = await res.json();
        alert(error.error || 'Error al guardar el egreso');
      }
    } catch {
      alert('Error de red al intentar registrar el egreso');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300 border border-slate-100">
        
        <div className="px-8 pt-8 pb-4 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Registro de Egreso</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Retiro de Efectivo de Gaveta</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
           
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Clasificación del Retiro *</label>
            <div className="grid grid-cols-2 gap-3">
               <label className={`border rounded-xl p-3 flex items-start gap-2 cursor-pointer transition-all ${formData.type === 'EXPENSE' ? 'border-rose-500 bg-rose-50 ring-1 ring-rose-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                 <input type="radio" className="mt-1 accent-rose-600" name="type" value="EXPENSE" checked={formData.type === 'EXPENSE'} onChange={(e) => setFormData({...formData, type: e.target.value})} />
                 <div>
                    <div className="font-bold text-slate-800 flex items-center gap-1 text-sm"><ArrowDownRight className="w-3 h-3 text-rose-500" /> Gasto Op.</div>
                    <div className="text-[10px] text-slate-500 leading-tight">Fletes, limpieza, etc.</div>
                 </div>
               </label>
               <label className={`border rounded-xl p-3 flex items-start gap-2 cursor-pointer transition-all ${formData.type === 'WITHDRAWAL' ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                 <input type="radio" className="mt-1 accent-amber-600" name="type" value="WITHDRAWAL" checked={formData.type === 'WITHDRAWAL'} onChange={(e) => setFormData({...formData, type: e.target.value})} />
                 <div>
                    <div className="font-bold text-slate-800 flex items-center gap-1 text-sm"><ArrowUpRight className="w-3 h-3 text-amber-500" /> Traslado</div>
                    <div className="text-[10px] text-slate-500 leading-tight">Entrega a bóveda</div>
                 </div>
               </label>
            </div>
          </div>

          <div>
             <label className="block text-sm font-bold text-slate-700 mb-1">Monto Retirado de Gaveta (Q) *</label>
             <div className="relative">
               <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">Q</span>
               <input autoFocus required type="number" step="0.01" min="0.01" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full pl-8 pr-4 py-3 bg-slate-50 font-bold text-rose-600 text-xl border rounded-xl focus:ring-2 focus:ring-rose-500 outline-none transition-shadow" placeholder="0.00" />
             </div>
          </div>

          <div>
             <label className="block text-sm font-bold text-slate-700 mb-1">Justificación / Razón *</label>
             <textarea required rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-4 border bg-slate-50 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none transition-shadow text-sm resize-none" placeholder="Ej: Pago de flete a Don Carlos para llevar bloques a Sucursal Norte..."></textarea>
          </div>

          <div className="pt-4 flex gap-4">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-3.5 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-all text-sm"
            >
              Cancelar
            </button>
            <button 
              disabled={isLoading} 
              type="submit" 
              className="flex-[1.5] py-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all shadow-xl shadow-rose-600/20 active:scale-[0.98] flex items-center justify-center gap-2.5 text-sm"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />} 
              Confirmar Retiro
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
