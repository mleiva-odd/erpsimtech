'use client';

import { useEffect, useState } from 'react';
import { Loader2, ReceiptText, Search, X } from 'lucide-react';

interface RecentSale {
  id: string;
  total: number | string;
  createdAt: string;
  customer?: { name: string } | null;
  user?: { name: string } | null;
  payments?: Array<{ method: string; amount: number | string }>;
}

interface RecentSalesModalProps {
  onClose: () => void;
  onSelectSale: (saleId: string) => void;
}

export function RecentSalesModal({ onClose, onSelectSale }: RecentSalesModalProps) {
  const [sales, setSales] = useState<RecentSale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadSales = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/sales?status=COMPLETED&limit=30', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) {
          setSales(Array.isArray(data) ? data : data.data || []);
        }
      } catch (error) {
        console.error('Error cargando ventas recientes:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadSales();

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredSales = sales.filter((sale) => {
    if (!normalizedQuery) return true;

    return (
      sale.id.toLowerCase().includes(normalizedQuery) ||
      sale.customer?.name?.toLowerCase().includes(normalizedQuery) ||
      sale.user?.name?.toLowerCase().includes(normalizedQuery)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl rounded-[2rem] border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-start justify-between px-8 pt-8 pb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Ventas Recientes</h2>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Reimpresión y devoluciones del turno
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-8 pb-4">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por ticket, cliente o usuario..."
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-8 pb-8">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-blue-600">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-center text-slate-500">
              <ReceiptText className="mb-3 h-10 w-10 opacity-25" />
              <p className="font-medium">No hay ventas que coincidan con la búsqueda.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSales.map((sale) => (
                <button
                  key={sale.id}
                  onClick={() => onSelectSale(sale.id)}
                  className="flex w-full items-center justify-between rounded-[1.5rem] border border-slate-100 bg-white px-5 py-4 text-left transition-all hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5"
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <span className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-0.5 text-slate-500">
                        #{sale.id.split('-')[0].toUpperCase()}
                      </span>
                      <span>{new Date(sale.createdAt).toLocaleString('es-GT')}</span>
                    </div>
                    <div className="font-bold text-slate-800">
                      {sale.customer?.name || 'Consumidor Final'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Atendido por {sale.user?.name || 'Sistema'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Total
                    </div>
                    <div className="text-2xl font-bold tracking-tight text-slate-900">
                      Q{Number(sale.total).toFixed(2)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
