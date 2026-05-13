'use client';

/**
 * Fase 22b · Reportes SAT (Libro de Ventas, Libro de Compras, Resumen IVA).
 */

import { useState, useEffect, useCallback } from 'react';
import { Receipt, FileText, BookOpen, Download, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

type TabKey = 'sales-book' | 'purchases-book' | 'iva-summary';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'sales-book', label: 'Libro de Ventas SAT', icon: <FileText className="w-4 h-4" /> },
  { key: 'purchases-book', label: 'Libro de Compras SAT', icon: <BookOpen className="w-4 h-4" /> },
  { key: 'iva-summary', label: 'Resumen IVA', icon: <Receipt className="w-4 h-4" /> },
];

function formatQ(n: number | string): string {
  return `Q${Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TaxReportsPage() {
  const [tab, setTab] = useState<TabKey>('sales-book');
  const { toast } = useToast();

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Receipt className="w-6 h-6 text-blue-600" /> Reportes SAT
        </h1>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition ${
              tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sales-book' && <BookTab endpoint="/api/reports/tax/sales-book" filename="libro_ventas" toast={toast} />}
      {tab === 'purchases-book' && <BookTab endpoint="/api/reports/tax/purchases-book" filename="libro_compras" toast={toast} />}
      {tab === 'iva-summary' && <IvaSummaryTab toast={toast} />}
    </div>
  );
}

type ToastFn = (input: { tone?: 'success' | 'error' | 'warning' | 'info'; message: string }) => void;

function BookTab({ endpoint, filename, toast }: { endpoint: string; filename: string; toast: ToastFn }) {
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, format: 'json' });
      const res = await fetch(`${endpoint}?${params}`);
      const json = await res.json();
      setData(Array.isArray(json) ? json : Array.isArray(json?.rows) ? json.rows : Array.isArray(json?.data) ? json.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [endpoint, from, to]);

  useEffect(() => { void load(); }, [load]);

  const downloadCsv = async () => {
    try {
      const params = new URLSearchParams({ from, to, format: 'csv' });
      const res = await fetch(`${endpoint}?${params}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${filename}_${from}_${to}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast({ tone: 'error', message: 'Error descargando CSV.' });
    }
  };

  const headers = data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-100 p-4 rounded-2xl">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
        </div>
        <button onClick={downloadCsv} className="ml-auto px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-700 transition">
          <Download className="w-4 h-4" /> Descargar CSV
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh]">
          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mx-auto opacity-50" />
            </div>
          ) : data.length === 0 ? (
            <div className="p-12 text-center text-slate-400">Sin datos en el rango seleccionado.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  {headers.map((h) => <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.slice(0, 200).map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    {headers.map((h) => (
                      <td key={h} className="px-3 py-2 whitespace-nowrap">{String((row as Record<string, unknown>)[h] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {data.length > 200 && (
          <p className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100">
            Mostrando 200 de {data.length} filas. Descarga el CSV para ver el reporte completo.
          </p>
        )}
      </div>
    </div>
  );
}

interface IvaSummary {
  period: string;
  ivaDebito: number;
  ivaCredito: number;
  saldo: number;
  ventasGravadas?: number;
  ventasExentas?: number;
  comprasGravadas?: number;
  comprasExentas?: number;
}

function IvaSummaryTab({ toast }: { toast: ToastFn }) {
  const [period, setPeriod] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [data, setData] = useState<IvaSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/reports/tax/iva-summary?period=${period}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      toast({ tone: 'error', message: 'No se pudo cargar el resumen IVA.' });
    } finally {
      setLoading(false);
    }
  }, [period, toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-100 p-4 rounded-2xl">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Período (YYYY-MM)</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 opacity-40" /></div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 text-rose-700">{error}</div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">IVA Débito (ventas)</p>
            <p className="text-2xl font-bold text-emerald-600">{formatQ(data.ivaDebito)}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">IVA Crédito (compras)</p>
            <p className="text-2xl font-bold text-rose-600">{formatQ(data.ivaCredito)}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100 border-b-4 border-b-blue-500">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Saldo a pagar</p>
            <p className="text-2xl font-bold text-slate-900">{formatQ(data.saldo)}</p>
          </div>
          {data.ventasGravadas != null && (
            <div className="bg-slate-50 p-4 rounded-2xl">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ventas gravadas</p>
              <p className="text-lg font-bold">{formatQ(data.ventasGravadas)}</p>
            </div>
          )}
          {data.ventasExentas != null && (
            <div className="bg-slate-50 p-4 rounded-2xl">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ventas exentas</p>
              <p className="text-lg font-bold">{formatQ(data.ventasExentas)}</p>
            </div>
          )}
          {data.comprasGravadas != null && (
            <div className="bg-slate-50 p-4 rounded-2xl">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Compras gravadas</p>
              <p className="text-lg font-bold">{formatQ(data.comprasGravadas)}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
