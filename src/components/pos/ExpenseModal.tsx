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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-fade-in">
        
        <div className="px-6 py-4 border-b border-rose-100 flex justify-between items-center bg-rose-600 text-white">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Wallet className="w-5 h-5" /> Retiro / Egreso de Caja
          </h2>
          <button onClick={onClose} className="text-rose-200 hover:text-white transition">
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
               <input autoFocus required type="number" step="0.01" min="0.01" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full pl-8 pr-4 py-3 bg-slate-50 font-black text-rose-600 text-xl border rounded-xl focus:ring-2 focus:ring-rose-500 outline-none transition-shadow" placeholder="0.00" />
             </div>
          </div>

          <div>
             <label className="block text-sm font-bold text-slate-700 mb-1">Justificación / Razón *</label>
             <textarea required rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-4 border bg-slate-50 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none transition-shadow text-sm resize-none" placeholder="Ej: Pago de flete a Don Carlos para llevar bloques a Sucursal Norte..."></textarea>
          </div>

          <div className="pt-2">
            <button disabled={isLoading} type="submit" className="w-full flex items-center justify-center gap-2 px-8 py-3.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg shadow-rose-600/30 active:scale-[0.98]">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />} 
              Descontar de Mi Caja
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
