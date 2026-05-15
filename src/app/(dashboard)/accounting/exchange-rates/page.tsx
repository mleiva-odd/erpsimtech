'use client';

/**
 * Fase 22c-5 · Multi-moneda UI · Pantalla de Tipos de Cambio.
 *
 * Mejoras sobre Fase 22b:
 *   - KPIs en header: última tasa USD→GTQ, fecha de captura, días sin
 *     actualizar y total de monedas habilitadas.
 *   - Vista destacada de "tasa del día" por moneda extranjera habilitada
 *     (consulta /api/accounting/exchange-rates/today por cada una).
 *   - Filtros: moneda + rango de fechas.
 *   - Fix: el endpoint devuelve `{ rates }` (no `{ data }`), antes la página
 *     no rendereaba nada.
 *   - cardRenderer mobile.
 *   - Botón "Capturar tasa del día" como acción primaria.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Coins, Plus, X, Loader2, RefreshCw, Trash2, Edit2, AlertTriangle, TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useToast } from '@/components/ui/toast';
import { DEFAULT_ENABLED_CURRENCIES } from '@/components/currency';

interface ExchangeRate {
  id: string;
  currency: string;
  date: string;
  rate: number | string;
  source: 'MANUAL' | 'BANGUAT' | 'API';
  notes?: string | null;
  createdAt?: string;
  createdBy?: { id: string; name: string | null } | null;
}

interface TodayRate {
  currency: string;
  rate: number;
  date: string;
  ageDays: number;
  warning: boolean;
  isFunctional?: boolean;
}

interface TodayMissing {
  missing: true;
  currency: string;
  /** Verifier MN: marca si el motivo es un error de la API (no 404 ni red). */
  error?: boolean;
}

type TodayState = TodayRate | TodayMissing;

const SOURCE_BADGE: Record<string, string> = {
  MANUAL: 'bg-slate-100 text-slate-600',
  BANGUAT: 'bg-blue-50 text-blue-700',
  API: 'bg-indigo-50 text-indigo-700',
};

const ALL_CURRENCIES = ['USD', 'EUR', 'MXN', 'GTQ'] as const;

// Currencies cuya "tasa del día" se muestra en el panel destacado.
const FX_CURRENCIES = DEFAULT_ENABLED_CURRENCIES.filter((c) => c !== 'GTQ');

export default function ExchangeRatesPage() {
  const { toast } = useToast();
  const [data, setData] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<ExchangeRate | null>(null);
  const [filterCurrency, setFilterCurrency] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [todayRates, setTodayRates] = useState<Record<string, TodayState>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCurrency) params.set('currency', filterCurrency);
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      const res = await fetch(`/api/accounting/exchange-rates?${params}`);
      const json = await res.json();
      const rates: ExchangeRate[] = Array.isArray(json?.rates)
        ? json.rates
        : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json)
            ? json
            : [];
      setData(rates);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterCurrency, filterFrom, filterTo]);

  const fetchTodayRates = useCallback(async () => {
    const next: Record<string, TodayState> = {};
    await Promise.all(
      FX_CURRENCIES.map(async (cur) => {
        try {
          const res = await fetch(`/api/accounting/exchange-rates/today?currency=${cur}`);
          if (res.status === 404) {
            next[cur] = { missing: true, currency: cur };
            return;
          }
          if (!res.ok) {
            // Verifier MN: si la API responde con error no-404, marcar la
            // moneda como error explícito (en vez de dejar undefined que
            // resultaría en spinner "Cargando..." infinito).
            next[cur] = { missing: true, currency: cur, error: true };
            return;
          }
          const body = (await res.json()) as TodayRate;
          next[cur] = body;
        } catch {
          // Network error: tratar igual que API error explícito.
          next[cur] = { missing: true, currency: cur, error: true };
        }
      }),
    );
    setTodayRates(next);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    void fetchTodayRates();
  }, [fetchTodayRates]);

  const syncBanguat = async () => {
    try {
      const res = await fetch('/api/accounting/exchange-rates/banguat-sync', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.status === 501 || res.status === 404) {
        toast({ tone: 'warning', message: 'Sincronización BANGUAT aún no implementada.' });
        return;
      }
      if (!res.ok) throw new Error(json.error || 'Error');
      toast({ tone: 'success', message: 'Sincronización completada.' });
      void fetchData();
      void fetchTodayRates();
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
      void fetchTodayRates();
    } else {
      const e = await res.json().catch(() => ({}));
      toast({ tone: 'error', message: e.error || 'No se pudo eliminar.' });
    }
  };

  const columns: DataTableColumn<ExchangeRate>[] = useMemo(
    () => [
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
        accessor: (r) => <span className="font-bold tabular-nums">Q {Number(r.rate).toFixed(4)}</span>,
        exportValue: (r) => `Q${Number(r.rate).toFixed(4)}`,
      },
      {
        key: 'source',
        header: 'Origen',
        accessor: (r) => (
          <span
            className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${SOURCE_BADGE[r.source] || 'bg-slate-100'}`}
          >
            {r.source}
          </span>
        ),
        exportValue: (r) => r.source,
      },
      {
        key: 'createdBy',
        header: 'Capturado por',
        accessor: (r) => r.createdBy?.name || '—',
        exportValue: (r) => r.createdBy?.name || '',
      },
      {
        key: 'notes',
        header: 'Notas',
        accessor: (r) => r.notes || '—',
        exportValue: (r) => r.notes || '',
      },
      {
        key: 'actions',
        header: '',
        accessor: (r) => (
          <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setEditing(r)}
              aria-label={`Editar notas del tipo de cambio ${r.currency} del ${r.date}`}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => deleteOne(r.id)}
              aria-label={`Eliminar tipo de cambio ${r.currency} del ${r.date}`}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Coins className="w-6 h-6 text-blue-600" /> Tipos de cambio
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Cotizaciones diarias por moneda extranjera (FX vs Q). Guatemala obliga llevar libros en Quetzales.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={syncBanguat}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition flex items-center gap-2"
            aria-label="Sincronizar tipos de cambio con BANGUAT"
          >
            <RefreshCw className="w-4 h-4" /> Sincronizar BANGUAT
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"
            aria-label="Capturar tipo de cambio del día"
          >
            <Plus className="w-4 h-4" /> Capturar tasa del día
          </button>
        </div>
      </div>

      {/* Tasas del día (KPIs por moneda) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {FX_CURRENCIES.map((cur) => {
          const state = todayRates[cur];
          if (!state) {
            return (
              <div
                key={cur}
                className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm animate-pulse"
              >
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{cur} → GTQ</p>
                <p className="mt-2 text-2xl font-bold text-slate-200">Cargando…</p>
              </div>
            );
          }
          if ('missing' in state) {
            return (
              <div
                key={cur}
                className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm"
                role="status"
              >
                <div className="flex items-start justify-between">
                  <p className="text-xs font-bold text-rose-600 uppercase tracking-widest">{cur} → GTQ</p>
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                </div>
                <p className="mt-2 text-lg font-bold text-rose-700">Sin tasa</p>
                <p className="text-xs text-rose-500 mt-1">Capturá la cotización para operar en {cur}.</p>
              </div>
            );
          }
          const tone = state.warning
            ? 'border-amber-200 bg-amber-50/40'
            : 'border-emerald-100 bg-white';
          return (
            <div key={cur} className={`rounded-2xl border ${tone} p-5 shadow-sm`}>
              <div className="flex items-start justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{cur} → GTQ</p>
                <TrendingUp
                  className={`w-4 h-4 ${state.warning ? 'text-amber-500' : 'text-emerald-500'}`}
                />
              </div>
              <p className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">
                Q {Number(state.rate).toFixed(4)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {format(new Date(state.date), "dd 'de' MMM yyyy", { locale: es })}
                {state.ageDays > 0 && (
                  <span className={`ml-1 ${state.warning ? 'text-amber-600 font-bold' : ''}`}>
                    · hace {state.ageDays}d
                    {state.warning ? ' (revisá)' : ''}
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="flex flex-col">
          <label htmlFor="filter-currency" className="text-[10px] font-bold text-slate-400 uppercase mb-1">
            Moneda
          </label>
          <select
            id="filter-currency"
            value={filterCurrency}
            onChange={(e) => setFilterCurrency(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
            aria-label="Filtrar por moneda"
          >
            <option value="">Todas</option>
            {ALL_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label htmlFor="filter-from" className="text-[10px] font-bold text-slate-400 uppercase mb-1">
            Desde
          </label>
          <input
            id="filter-from"
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
            aria-label="Fecha inicial"
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="filter-to" className="text-[10px] font-bold text-slate-400 uppercase mb-1">
            Hasta
          </label>
          <input
            id="filter-to"
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
            aria-label="Fecha final"
          />
        </div>
        {(filterCurrency || filterFrom || filterTo) && (
          <button
            onClick={() => {
              setFilterCurrency('');
              setFilterFrom('');
              setFilterTo('');
            }}
            className="self-end text-xs font-bold text-slate-500 underline px-2 py-2"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        getRowId={(r) => r.id}
        enableCsvExport
        exportFileName="exchange_rates"
        emptyMessage="No hay tipos de cambio capturados con esos filtros."
        cardRenderer={(r) => (
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-slate-500 font-bold">
                {format(new Date(r.date), 'dd/MM/yyyy')}
              </p>
              <p className="text-sm font-bold text-slate-900 font-mono">{r.currency}</p>
              {r.notes && <p className="text-[11px] text-slate-400 mt-0.5">{r.notes}</p>}
            </div>
            <div className="text-right">
              <p className="text-lg font-bold tabular-nums text-slate-900">
                Q {Number(r.rate).toFixed(4)}
              </p>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${SOURCE_BADGE[r.source] || 'bg-slate-100'}`}
              >
                {r.source}
              </span>
            </div>
          </div>
        )}
      />

      {(showNew || editing) && (
        <ExchangeRateModal
          editing={editing}
          onClose={() => {
            setShowNew(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowNew(false);
            setEditing(null);
            void fetchData();
            void fetchTodayRates();
            toast({ tone: 'success', message: 'Guardado.' });
          }}
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
    <div
      className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exchange-rate-modal-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="p-6 flex justify-between items-start border-b border-slate-100">
          <h3 id="exchange-rate-modal-title" className="text-xl font-bold text-slate-900">
            {editing ? 'Editar tipo de cambio' : 'Capturar tipo de cambio'}
          </h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          {editing && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              Solo se pueden editar las notas. El rate, moneda y fecha son inmutables — si querés
              corregir, eliminá y volvé a capturar.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fx-currency" className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
                Moneda
              </label>
              <select
                id="fx-currency"
                disabled={!!editing}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm disabled:bg-slate-50"
              >
                {ALL_CURRENCIES.filter((c) => c !== 'GTQ').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fx-date" className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
                Fecha
              </label>
              <input
                id="fx-date"
                disabled={!!editing}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm disabled:bg-slate-50"
              />
            </div>
          </div>
          <div>
            <label htmlFor="fx-rate" className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
              Tasa (Q por unidad de {currency})
            </label>
            <input
              id="fx-rate"
              disabled={!!editing}
              type="number"
              step="0.0001"
              min="0"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm disabled:bg-slate-50 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="fx-source" className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
              Origen
            </label>
            <select
              id="fx-source"
              disabled={!!editing}
              value={source}
              onChange={(e) => setSource(e.target.value as 'MANUAL' | 'BANGUAT' | 'API')}
              className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm disabled:bg-slate-50"
            >
              <option value="MANUAL">Manual</option>
              <option value="BANGUAT">BANGUAT</option>
              <option value="API">API externa</option>
            </select>
          </div>
          <div>
            <label htmlFor="fx-notes" className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
              Notas
            </label>
            <textarea
              id="fx-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm resize-none"
            />
          </div>
          {error && <p className="text-rose-500 text-xs font-bold" role="alert">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl">
            Cancelar
          </button>
          <button
            disabled={busy || (!editing && rate <= 0)}
            onClick={submit}
            className="flex-1 py-3 font-bold text-white bg-slate-900 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
