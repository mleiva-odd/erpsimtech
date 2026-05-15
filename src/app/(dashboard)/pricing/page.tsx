'use client';

/**
 * Fase 22b · CRUD de listas de precios, promociones y cupones (Fase 20).
 */

import { useState, useEffect, useCallback } from 'react';
import { Tags, Tag, Ticket, Plus, X, Loader2, Trash2, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useToast } from '@/components/ui/toast';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

type TabKey = 'price-lists' | 'promotions' | 'coupons';

interface PriceList {
  id: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  active: boolean;
  createdAt: string;
}

interface Promotion {
  id: string;
  name: string;
  type: 'BUY_N_GET_M' | 'PERCENTAGE_OFF' | 'FIXED_PRICE';
  minPurchase?: number | string | null;
  quantityRequired?: number | null;
  quantityFree?: number | null;
  discountRate?: number | string | null;
  fixedPrice?: number | string | null;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

interface Coupon {
  id: string;
  code: string;
  type: 'FIXED_AMOUNT' | 'PERCENTAGE_OFF';
  amount?: number | string | null;
  percentage?: number | string | null;
  maxUses?: number | null;
  perCustomerLimit?: number | null;
  minPurchase?: number | string | null;
  validFrom: string;
  validUntil: string;
  active: boolean;
}

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'price-lists', label: 'Listas de precios', icon: <Tags className="w-4 h-4" /> },
  { key: 'promotions', label: 'Promociones', icon: <Tag className="w-4 h-4" /> },
  { key: 'coupons', label: 'Cupones', icon: <Ticket className="w-4 h-4" /> },
];

export default function PricingPage() {
  const [tab, setTab] = useState<TabKey>('price-lists');

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Ventas', href: '/sales' },
          { label: 'Listas y Promociones' },
        ]}
        className="mb-6"
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Tags className="w-6 h-6 text-blue-600" /> Listas, promociones y cupones
        </h1>
        <p className="text-sm text-slate-500 mt-1">Estrategia comercial multi-canal.</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition ${
              tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'price-lists' && <PriceListsTab />}
      {tab === 'promotions' && <PromotionsTab />}
      {tab === 'coupons' && <CouponsTab />}
    </div>
  );
}

function PriceListsTab() {
  const { toast } = useToast();
  const [data, setData] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PriceList | null>(null);
  const [showNew, setShowNew] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/price-lists');
      const json = await res.json();
      setData(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const deleteOne = async (id: string) => {
    if (!confirm('¿Eliminar lista de precios?')) return;
    const res = await fetch(`/api/price-lists/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ tone: 'success', message: 'Eliminada.' });
      void fetchData();
    } else {
      toast({ tone: 'error', message: 'No se pudo eliminar.' });
    }
  };

  const columns: DataTableColumn<PriceList>[] = [
    {
      key: 'name',
      header: 'Nombre',
      mobilePriority: 'title',
      accessor: (r) => (
        <div>
          <span className="font-bold">{r.name}</span>
          {r.isDefault && <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded">DEFAULT</span>}
        </div>
      ),
      exportValue: (r) => r.name,
    },
    { key: 'description', header: 'Descripción', accessor: (r) => r.description || '—', exportValue: (r) => r.description || '' },
    {
      key: 'active',
      header: 'Activa',
      mobilePriority: 'highlight',
      accessor: (r) => (
        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${r.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {r.active ? 'Activa' : 'Inactiva'}
        </span>
      ),
      exportValue: (r) => (r.active ? 'sí' : 'no'),
    },
    {
      key: 'actions',
      header: 'Acciones',
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
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowNew(true)}
          className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nueva lista
        </button>
      </div>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        getRowId={(r) => r.id}
        enableCsvExport
        exportFileName="price_lists"
      />
      {(showNew || editing) && (
        <PriceListModal
          editing={editing}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); void fetchData(); toast({ tone: 'success', message: 'Guardada.' }); }}
        />
      )}
    </>
  );
}

function PriceListModal({ editing, onClose, onSaved }: { editing: PriceList | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [isDefault, setIsDefault] = useState(editing?.isDefault || false);
  const [active, setActive] = useState(editing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const path = editing ? `/api/price-lists/${editing.id}` : '/api/price-lists';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || null, isDefault, active }),
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
    <SimpleModal title={editing ? 'Editar lista' : 'Nueva lista'} onClose={onClose}>
      <div className="space-y-4">
        <FormField label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
        </FormField>
        <FormField label="Descripción">
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50 resize-none" />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Default
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activa
        </label>
        {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} busy={busy} />
    </SimpleModal>
  );
}

function PromotionsTab() {
  const { toast } = useToast();
  const [data, setData] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/promotions');
      const json = await res.json();
      setData(json.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const deleteOne = async (id: string) => {
    if (!confirm('¿Eliminar promoción?')) return;
    const res = await fetch(`/api/promotions/${id}`, { method: 'DELETE' });
    if (res.ok) { toast({ tone: 'success', message: 'Eliminada.' }); void fetchData(); }
  };

  const columns: DataTableColumn<Promotion>[] = [
    { key: 'name', header: 'Nombre', mobilePriority: 'title', accessor: (r) => <span className="font-bold">{r.name}</span>, exportValue: (r) => r.name },
    { key: 'type', header: 'Tipo', accessor: (r) => r.type },
    {
      key: 'validez',
      header: 'Vigencia',
      accessor: (r) => `${format(new Date(r.startsAt), 'dd/MM/yyyy')} → ${format(new Date(r.endsAt), 'dd/MM/yyyy')}`,
    },
    {
      key: 'active',
      header: 'Activa',
      mobilePriority: 'highlight',
      accessor: (r) => (
        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${r.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {r.active ? 'Activa' : 'Inactiva'}
        </span>
      ),
      exportValue: (r) => (r.active ? 'sí' : 'no'),
    },
    {
      key: 'actions',
      header: 'Acciones',
      accessor: (r) => (
        <button onClick={() => deleteOne(r.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowNew(true)} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nueva promoción
        </button>
      </div>
      <DataTable columns={columns} data={data} loading={loading} getRowId={(r) => r.id} enableCsvExport exportFileName="promotions" />
      {showNew && (
        <PromotionModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); void fetchData(); toast({ tone: 'success', message: 'Promoción creada.' }); }} />
      )}
    </>
  );
}

function PromotionModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'BUY_N_GET_M' | 'PERCENTAGE_OFF' | 'FIXED_PRICE'>('PERCENTAGE_OFF');
  const [discountRate, setDiscountRate] = useState(0.1);
  const [fixedPrice, setFixedPrice] = useState(0);
  const [quantityRequired, setQuantityRequired] = useState(2);
  const [quantityFree, setQuantityFree] = useState(1);
  const [minPurchase, setMinPurchase] = useState(0);
  const [startsAt, setStartsAt] = useState(new Date().toISOString());
  const [endsAt, setEndsAt] = useState(new Date(Date.now() + 30 * 86400000).toISOString());
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name,
        type,
        startsAt,
        endsAt,
        active,
        minPurchase: minPurchase || null,
      };
      if (type === 'PERCENTAGE_OFF') payload.discountRate = discountRate;
      if (type === 'FIXED_PRICE') payload.fixedPrice = fixedPrice;
      if (type === 'BUY_N_GET_M') {
        payload.quantityRequired = quantityRequired;
        payload.quantityFree = quantityFree;
      }
      const res = await fetch('/api/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    <SimpleModal title="Nueva promoción" onClose={onClose}>
      <div className="space-y-3">
        <FormField label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" /></FormField>
        <FormField label="Tipo">
          <select value={type} onChange={(e) => setType(e.target.value as 'BUY_N_GET_M' | 'PERCENTAGE_OFF' | 'FIXED_PRICE')} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50">
            <option value="PERCENTAGE_OFF">% off</option>
            <option value="FIXED_PRICE">Precio fijo</option>
            <option value="BUY_N_GET_M">Lleva N paga M</option>
          </select>
        </FormField>
        {type === 'PERCENTAGE_OFF' && (
          <FormField label="Descuento (0..1)">
            <input type="number" step="0.01" min="0" max="1" value={discountRate} onChange={(e) => setDiscountRate(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
          </FormField>
        )}
        {type === 'FIXED_PRICE' && (
          <FormField label="Precio fijo">
            <input type="number" step="0.01" value={fixedPrice} onChange={(e) => setFixedPrice(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
          </FormField>
        )}
        {type === 'BUY_N_GET_M' && (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Lleva N">
              <input type="number" value={quantityRequired} onChange={(e) => setQuantityRequired(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
            </FormField>
            <FormField label="Paga M">
              <input type="number" value={quantityFree} onChange={(e) => setQuantityFree(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
            </FormField>
          </div>
        )}
        <FormField label="Compra mínima (opcional)">
          <input type="number" step="0.01" value={minPurchase} onChange={(e) => setMinPurchase(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Inicio">
            <input type="datetime-local" value={startsAt.slice(0, 16)} onChange={(e) => setStartsAt(new Date(e.target.value).toISOString())} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
          </FormField>
          <FormField label="Fin">
            <input type="datetime-local" value={endsAt.slice(0, 16)} onChange={(e) => setEndsAt(new Date(e.target.value).toISOString())} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activa
        </label>
        {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} busy={busy} />
    </SimpleModal>
  );
}

function CouponsTab() {
  const { toast } = useToast();
  const [data, setData] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/coupons');
      const json = await res.json();
      setData(json.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const deleteOne = async (code: string) => {
    if (!confirm(`¿Eliminar cupón ${code}?`)) return;
    const res = await fetch(`/api/coupons/${code}`, { method: 'DELETE' });
    if (res.ok) { toast({ tone: 'success', message: 'Eliminado.' }); void fetchData(); }
  };

  const columns: DataTableColumn<Coupon>[] = [
    { key: 'code', header: 'Código', mobilePriority: 'title', accessor: (r) => <span className="font-mono font-bold">{r.code}</span>, exportValue: (r) => r.code },
    { key: 'type', header: 'Tipo', accessor: (r) => r.type === 'FIXED_AMOUNT' ? 'Monto fijo' : '% off' },
    {
      key: 'discount',
      header: 'Descuento',
      mobilePriority: 'highlight',
      accessor: (r) => r.type === 'FIXED_AMOUNT' ? `Q${Number(r.amount).toFixed(2)}` : `${(Number(r.percentage) * 100).toFixed(0)}%`,
    },
    {
      key: 'vigencia',
      header: 'Vigencia',
      accessor: (r) => `${format(new Date(r.validFrom), 'dd/MM/yyyy')} → ${format(new Date(r.validUntil), 'dd/MM/yyyy')}`,
    },
    {
      key: 'active',
      header: 'Activo',
      accessor: (r) => (
        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${r.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {r.active ? 'Activo' : 'Inactivo'}
        </span>
      ),
      exportValue: (r) => (r.active ? 'sí' : 'no'),
    },
    {
      key: 'actions',
      header: '',
      accessor: (r) => (
        <button onClick={() => deleteOne(r.code)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowNew(true)} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nuevo cupón
        </button>
      </div>
      <DataTable columns={columns} data={data} loading={loading} getRowId={(r) => r.id} enableCsvExport exportFileName="coupons" />
      {showNew && (
        <CouponModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); void fetchData(); toast({ tone: 'success', message: 'Cupón creado.' }); }} />
      )}
    </>
  );
}

function CouponModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState('');
  const [type, setType] = useState<'FIXED_AMOUNT' | 'PERCENTAGE_OFF'>('PERCENTAGE_OFF');
  const [amount, setAmount] = useState(0);
  const [percentage, setPercentage] = useState(0.1);
  const [maxUses, setMaxUses] = useState(100);
  const [perCustomerLimit, setPerCustomerLimit] = useState(1);
  const [minPurchase, setMinPurchase] = useState(0);
  const [validFrom, setValidFrom] = useState(new Date().toISOString());
  const [validUntil, setValidUntil] = useState(new Date(Date.now() + 90 * 86400000).toISOString());
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        code: code.toUpperCase(),
        type,
        validFrom,
        validUntil,
        active,
        maxUses: maxUses || null,
        perCustomerLimit: perCustomerLimit || null,
        minPurchase: minPurchase || null,
      };
      if (type === 'FIXED_AMOUNT') payload.amount = amount;
      if (type === 'PERCENTAGE_OFF') payload.percentage = percentage;
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    <SimpleModal title="Nuevo cupón" onClose={onClose}>
      <div className="space-y-3">
        <FormField label="Código">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50 font-mono uppercase" />
        </FormField>
        <FormField label="Tipo">
          <select value={type} onChange={(e) => setType(e.target.value as 'FIXED_AMOUNT' | 'PERCENTAGE_OFF')} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50">
            <option value="PERCENTAGE_OFF">% off</option>
            <option value="FIXED_AMOUNT">Monto fijo</option>
          </select>
        </FormField>
        {type === 'FIXED_AMOUNT' && (
          <FormField label="Monto (Q)">
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
          </FormField>
        )}
        {type === 'PERCENTAGE_OFF' && (
          <FormField label="Descuento (0..1)">
            <input type="number" step="0.01" min="0" max="1" value={percentage} onChange={(e) => setPercentage(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
          </FormField>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Usos máx.">
            <input type="number" value={maxUses} onChange={(e) => setMaxUses(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
          </FormField>
          <FormField label="Por cliente">
            <input type="number" value={perCustomerLimit} onChange={(e) => setPerCustomerLimit(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
          </FormField>
        </div>
        <FormField label="Compra mínima (opcional)">
          <input type="number" step="0.01" value={minPurchase} onChange={(e) => setMinPurchase(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Vigente desde">
            <input type="datetime-local" value={validFrom.slice(0, 16)} onChange={(e) => setValidFrom(new Date(e.target.value).toISOString())} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
          </FormField>
          <FormField label="Vigente hasta">
            <input type="datetime-local" value={validUntil.slice(0, 16)} onChange={(e) => setValidUntil(new Date(e.target.value).toISOString())} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm focus:ring-4 focus:ring-blue-50" />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activo
        </label>
        {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} busy={busy} />
    </SimpleModal>
  );
}

function SimpleModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="p-6 flex justify-between items-start border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 overflow-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: () => void; busy: boolean }) {
  return (
    <div className="p-6 border-t border-slate-100 flex gap-3 mt-auto">
      <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl">Cancelar</button>
      <button
        disabled={busy}
        onClick={onSubmit}
        className="flex-1 py-3 font-bold text-white bg-slate-900 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Guardar
      </button>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">{label}</label>
      {children}
    </div>
  );
}
