'use client';

/**
 * Fase 22b · CRUD de reglas de comisión (Fase 20).
 */

import { useState, useEffect, useCallback } from 'react';
import { Award, Plus, X, Loader2, Trash2 } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useToast } from '@/components/ui/toast';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface Rule {
  id: string;
  name: string;
  categoryId?: string | null;
  basis: 'MARGIN' | 'SUBTOTAL';
  rate: number | string;
  active: boolean;
}

interface Category { id: string; name: string }

export default function CommissionRulesPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/commission-rules');
      const json = await res.json();
      setData(json.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d) => Array.isArray(d?.data) ? setCategories(d.data) : Array.isArray(d) ? setCategories(d) : null)
      .catch(() => {});
  }, []);

  const deleteOne = async (id: string) => {
    if (!confirm('¿Eliminar regla?')) return;
    const res = await fetch(`/api/commission-rules?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ tone: 'success', message: 'Eliminada.' });
      void fetchData();
    }
  };

  const columns: DataTableColumn<Rule>[] = [
    { key: 'name', header: 'Regla', mobilePriority: 'title', accessor: (r) => <span className="font-bold">{r.name}</span>, exportValue: (r) => r.name },
    { key: 'basis', header: 'Base', accessor: (r) => r.basis === 'MARGIN' ? 'Margen' : 'Subtotal' },
    { key: 'rate', header: 'Tasa', mobilePriority: 'highlight', accessor: (r) => `${(Number(r.rate) * 100).toFixed(2)}%`, exportValue: (r) => `${(Number(r.rate) * 100).toFixed(2)}%` },
    {
      key: 'category',
      header: 'Categoría',
      accessor: (r) => {
        if (!r.categoryId) return 'Todas';
        return categories.find((c) => c.id === r.categoryId)?.name || r.categoryId;
      },
    },
    {
      key: 'active',
      header: 'Estado',
      accessor: (r) => (
        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${r.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {r.active ? 'Activa' : 'Inactiva'}
        </span>
      ),
      exportValue: (r) => (r.active ? 'sí' : 'no'),
    },
    {
      key: 'actions',
      header: '',
      accessor: (r) => (
        <button onClick={() => deleteOne(r.id)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Ventas', href: '/sales' },
          { label: 'Comisiones', href: '/sales/commissions' },
          { label: 'Reglas' },
        ]}
        className="mb-6"
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Award className="w-6 h-6 text-blue-600" /> Reglas de comisión
          </h1>
          <p className="text-sm text-slate-500 mt-1">Define la tasa de comisión por categoría y base de cálculo.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nueva regla
        </button>
      </div>

      <DataTable columns={columns} data={data} loading={loading} getRowId={(r) => r.id} enableCsvExport exportFileName="commission_rules" />

      {showNew && (
        <NewRuleModal
          categories={categories}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); void fetchData(); toast({ tone: 'success', message: 'Regla creada.' }); }}
        />
      )}
    </div>
  );
}

function NewRuleModal({ categories, onClose, onSaved }: { categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [basis, setBasis] = useState<'MARGIN' | 'SUBTOTAL'>('MARGIN');
  const [rate, setRate] = useState(0.05);
  const [categoryId, setCategoryId] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/commission-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          basis,
          rate,
          active,
          categoryId: categoryId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
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
          <h3 className="text-xl font-bold text-slate-900">Nueva regla</h3>
          <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Base</label>
              <select value={basis} onChange={(e) => setBasis(e.target.value as 'MARGIN' | 'SUBTOTAL')} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm">
                <option value="MARGIN">Margen</option>
                <option value="SUBTOTAL">Subtotal</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Tasa (0..1)</label>
              <input type="number" step="0.001" min="0" max="1" value={rate} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Categoría (opcional)</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm">
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activa
          </label>
          {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl">Cancelar</button>
          <button disabled={busy} onClick={submit} className="flex-1 py-3 font-bold text-white bg-blue-600 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
