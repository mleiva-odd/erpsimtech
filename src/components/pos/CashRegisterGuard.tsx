'use client';

import { useState, useEffect } from 'react';
import { Lock, Unlock, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

export function CashRegisterGuard({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [openingBalance, setOpeningBalance] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const { toast } = useToast();

  const fetchRegisterStatus = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const res = await fetch('/api/cash-register', {
        cache: 'no-store',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No fue posible leer el estado de la caja.');
      }

      setIsOpen(data.status === 'OPEN');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'No fue posible leer el estado de la caja.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRegisterStatus();
  }, []);

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/cash-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingBalance: Number(openingBalance) })
      });
      if (res.ok) {
        setIsOpen(true);
        setLoadError('');
      } else {
        const data = await res.json();
        toast({ tone: 'error', message: data.error || 'Error al abrir caja' });
      }
    } catch (error) {
      toast({ tone: 'error', message: 'Error de conexión al abrir caja' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500">Verificando estado de la caja...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100 text-center">
          <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <RefreshCw className="w-10 h-10" />
          </div>

          <h1 className="text-2xl font-bold text-slate-800 mb-2">Estado de Caja No Disponible</h1>
          <p className="text-slate-500 mb-8">{loadError}</p>

          <button
            type="button"
            onClick={fetchRegisterStatus}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-lg transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (isOpen) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100 text-center">
        <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-10 h-10" />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Caja Cerrada</h1>
        <p className="text-slate-500 mb-8">Debes inicializar el turno con un monto base de efectivo para comenzar a despachar ventas.</p>

        <form onSubmit={handleOpen} className="space-y-6">
          <div className="text-left">
            <label className="block text-sm font-medium text-slate-700 mb-2">Fondo de Caja (Monto Inicial)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">Q</span>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={openingBalance}
                onChange={e => setOpeningBalance(e.target.value)}
                placeholder="0.00"
                className="w-full text-lg pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || openingBalance === ''}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-lg transition-colors disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Unlock className="w-6 h-6" />}
            Aperturar Turno
          </button>
        </form>
      </div>
    </div>
  );
}
