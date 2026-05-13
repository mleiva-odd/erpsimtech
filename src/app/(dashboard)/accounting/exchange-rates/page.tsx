'use client';

/**
 * Fase 22b · Tipos de cambio (Fase 21).
 */

import { useState, useEffect, useCallback } from 'react';
import { Coins, Plus, X, Loader2, RefreshCw, Trash2, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useToast } from '@/components/ui/toast';

interface ExchangeRate {
  id: string;
  currency: string;
  date: string;
  rate: number | string;
  source: 'MANUAL' | 'BANGUAT' | 'API';
  notes?: string | null;
  createdAt?: string;
}

const SOURCE_BADGE: Record<string, string> = {
  MANUAL: 'bg-slate-100 text-slate-600',
  BANGUAT: 'bg-blue-50 text-blue-700',
  API: 'bg-indigo-50 text-indigo-700',
};

const CURRENCIES = ['USD', 'EUR', 'MXN', 'GTQ'];

export default function ExchangeRatesPage() {
  const { toast } = useToast();
  const [data, setData] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<ExchangeRate | null>(null);
  const [filter, setFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set('currency', filter);
      const res = await fetch(`/api/accounting/exchange-rates?${params}`);
      const json = await res.json();
      setData(Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const syncBanguat = async () => {
    try {
      const res = await fetch('/api/accounting/exchange-rates/banguat-sync', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.status === 501) {
        toast({ tone: 'warning', message: 'Sincronización BANGUAT aún no implementada.' });
        return;
      }
      if (!res.ok) throw new Error(json.error || 'Error');
      toast({ tone: 'success', message: 'Sincronización completada.' });
      void fetchData();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    }
  };

  const deleteOne = async (id: string) => {
    if (!confirm('¿Eliminar tipo de cambio?')) return;
    const res = await fetch(`/api/accounting/exchange-rates/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ tone: 'success', message: 'Eliminado.' });
      void fetchData();
    } else {
      const e = await res.json().catch(() => ({}));
      toast({ tone: 'error', message: e.error || 'No se pudo eliminar.' });
    }
  };

  const columns: DataTableColumn<ExchangeRate>[] = [
    {
      key: 'date',
      header: 'Fecha',
      mobilePriority: 'title',
      accessor: (r) => format(new Date(r.date), 'dd/MM/yyyy'),
      exportValue: (r) => format(new Date(r.date), 'dd/MM/yyyy'),
    },
    {
      key: 'currency',
      header: 'Moneda',
      accessor: (r) => <span className="font-mono font-bold">{r.currency}</span>,
      exportValue: (r) => r.currency,
    },
    {
      key: 'rate',
      header: 'Cotización',
      mobilePriority: 'highlight',
      accessor: (r) => <span className="font-bold">Q{Number(r.rate).toFixed(4)}</span>,
      exportValue: (r) => `Q${Number(r.rate).toFixed(4)}`,
    },
    {
      key: 'source',
      header: 'Origen',
      accessor: (r) => (
        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${SOURCE_BADGE[r.source] || 'bg-slate-100'}`}>
          {r.source}
        </span>
      ),
      exportValue: (r) => r.source,
    },
    { key: 'notes', header: 'Notas', accessor: (r) => r.notes || '—', exportValue: (r) => r.notes || '' },
    {
      key: 'actions',
      header: '',
      accessor: (r) => (
        <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setEditing(r)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => deleteOne(r.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Coins className="w-6 h-6 text-blue-600" /> Tipos de cambio
          </h1>
          <p className="text-sm text-slate-500 mt-1">Cotizaciones diarias por moneda extranjera (FX vs Q).</p>
        </div>
        <div className="flex gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white">
            <option value="">Todas las monedas</option>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={syncBanguat} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Sincronizar BANGUAT
          </button>
          <button onClick={() => setShowNew(true)} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Capturar
          </button>
        </div>
      </div>

      <DataTable columns={columns} data={data} loading={loading} getRowId={(r) => r.id} enableCsvExport exportFileName="exchange_rates" />

      {(showNew || editing) && (
        <ExchangeRateModal
          editing={editing}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); void fetchData(); toast({ tone: 'success', message: 'Guardado.' }); }}
        />
      )}
    </div>
  );
}

function ExchangeRateModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: ExchangeRate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [currency, setCurrency] = useState(editing?.currency || 'USD');
  const [date, setDate] = useState(editing?.date.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [rate, setRate] = useState(Number(editing?.rate ?? 0));
  const [source, setSource] = useState<'MANUAL' | 'BANGUAT' | 'API'>(editing?.source ?? 'MANUAL');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (editing) {
        // Solo se pueden editar las notas.
        const res = await fetch(`/api/accounting/exchange-rates/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: notes || null }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Error');
      } else {
        const res = await fetch('/api/accounting/exchange-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currency, date, rate, source, notes: notes || null }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Error');
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="p-6 flex justify-between items-start border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-900">{editing ? 'Editar tipo de cambio' : 'Capturar tipo de cambio'}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Moneda</label>
              <select disabled={!!editing} value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm disabled:bg-slate-50">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Fecha</label>
              <input disabled={!!editing} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm disabled:bg-slate-50" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Tasa (Q por unidad)</label>
            <input disabled={!!editing} type="number" step="0.0001" value={rate} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm disabled:bg-slate-50" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Origen</label>
            <select disabled={!!editing} value={source} onChange={(e) => setSource(e.target.value as 'MANUAL' | 'BANGUAT' | 'API')} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm disabled:bg-slate-50">
              <option value="MANUAL">Manual</option>
              <option value="BANGUAT">BANGUAT</option>
              <option value="API">API externa</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Notas</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm resize-none" />
          </div>
          {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl">Cancelar</button>
          <button disabled={busy} onClick={submit} className="flex-1 py-3 font-bold text-white bg-slate-900 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
