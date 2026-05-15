'use client';

/**
 * Fase 22b · Reportes de inventario.
 */

import { useState, useEffect, useCallback } from 'react';
import { Package, BookOpen, Activity, Snowflake, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

type TabKey = 'kardex' | 'valuation' | 'slow-movers';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'kardex', label: 'Kardex', icon: <BookOpen className="w-4 h-4" /> },
  { key: 'valuation', label: 'Valuación', icon: <Activity className="w-4 h-4" /> },
  { key: 'slow-movers', label: 'Slow movers', icon: <Snowflake className="w-4 h-4" /> },
];

function formatQ(n: number | string): string {
  return `Q${Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InventoryReportsPage() {
  const [tab, setTab] = useState<TabKey>('kardex');

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Reportes', href: '/reports' },
          { label: 'Inventario' },
        ]}
        className="mb-6"
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Package className="w-6 h-6 text-blue-600" /> Reportes de inventario
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

      {tab === 'kardex' && <KardexTab />}
      {tab === 'valuation' && <ValuationTab />}
      {tab === 'slow-movers' && <SlowMoversTab />}
    </div>
  );
}

interface ProductLite { id: string; name: string; sku: string }
interface BranchLite { id: string; name: string }

interface KardexRow {
  id: string;
  createdAt: string;
  type: string;
  quantityChange: number | string;
  unitCost: number | string;
  balanceAfter: number | string;
  reason?: string | null;
}

function KardexTab() {
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [productId, setProductId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<KardexRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/products?limit=200').then((r) => r.json()).then((d) => setProducts(d.products || [])).catch(() => {});
    fetch('/api/branches').then((r) => r.json()).then((d) => Array.isArray(d) ? setBranches(d) : Array.isArray(d?.branches) ? setBranches(d.branches) : null).catch(() => {});
  }, []);

  const search = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ productId });
      if (branchId) params.set('branchId', branchId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/reports/inventory/kardex?${params}`);
      const json = await res.json();
      setData(Array.isArray(json) ? json : Array.isArray(json?.movements) ? json.movements : Array.isArray(json?.data) ? json.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [productId, branchId, from, to]);

  const columns: DataTableColumn<KardexRow>[] = [
    { key: 'createdAt', header: 'Fecha', mobilePriority: 'title', accessor: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy HH:mm'), exportValue: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy HH:mm') },
    { key: 'type', header: 'Tipo', accessor: (r) => r.type },
    { key: 'quantityChange', header: '+/-', accessor: (r) => Number(r.quantityChange) },
    { key: 'unitCost', header: 'Costo unit.', accessor: (r) => formatQ(r.unitCost), exportValue: (r) => formatQ(r.unitCost) },
    { key: 'balanceAfter', header: 'Saldo', mobilePriority: 'highlight', accessor: (r) => Number(r.balanceAfter) },
    { key: 'reason', header: 'Razón', accessor: (r) => r.reason || '—' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white border border-slate-100 p-4 rounded-2xl">
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white">
          <option value="">Selecciona producto…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
        </select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white">
          <option value="">Todas las sucursales</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
        <button onClick={search} disabled={!productId || loading} className="md:col-span-4 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Consultar kardex
        </button>
      </div>

      <DataTable columns={columns} data={data} loading={loading} getRowId={(r) => r.id} enableCsvExport enablePdfExport exportFileName="kardex" emptyMessage="Selecciona un producto para ver el kardex." />
    </div>
  );
}

interface ValuationProduct { productId: string; productName: string; sku: string; quantity: number; investment: number; potentialRevenue: number }

function ValuationTab() {
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [branchId, setBranchId] = useState('');
  const [data, setData] = useState<ValuationProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/branches').then((r) => r.json()).then((d) => Array.isArray(d) ? setBranches(d) : Array.isArray(d?.branches) ? setBranches(d.branches) : null).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (branchId) params.set('branchId', branchId);
      const res = await fetch(`/api/reports/inventory/valuation?${params}`);
      const json = await res.json();
      setData(Array.isArray(json?.products) ? json.products : Array.isArray(json?.data) ? json.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { void load(); }, [load]);

  const columns: DataTableColumn<ValuationProduct>[] = [
    { key: 'productName', header: 'Producto', mobilePriority: 'title', accessor: (r) => <span className="font-bold">{r.productName}</span>, exportValue: (r) => r.productName },
    { key: 'sku', header: 'SKU', accessor: (r) => <span className="font-mono text-xs">{r.sku}</span> },
    { key: 'quantity', header: 'Cantidad', accessor: (r) => Number(r.quantity) },
    { key: 'investment', header: 'Inversión', mobilePriority: 'highlight', accessor: (r) => formatQ(r.investment), exportValue: (r) => formatQ(r.investment) },
    { key: 'potentialRevenue', header: 'Venta esperada', accessor: (r) => formatQ(r.potentialRevenue), exportValue: (r) => formatQ(r.potentialRevenue) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 bg-white border border-slate-100 p-4 rounded-2xl">
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white">
          <option value="">Todas las sucursales</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <DataTable columns={columns} data={data} loading={loading} getRowId={(r) => r.productId} enableCsvExport enablePdfExport exportFileName="valuacion_inventario" />
    </div>
  );
}

interface SlowMover { productId: string; productName: string; sku: string; daysWithoutMovement: number; currentStock: number; lastMovementAt?: string | null }

function SlowMoversTab() {
  const [days, setDays] = useState(60);
  const [data, setData] = useState<SlowMover[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/inventory/slow-movers?days=${days}`);
      const json = await res.json();
      setData(Array.isArray(json?.products) ? json.products : Array.isArray(json) ? json : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const columns: DataTableColumn<SlowMover>[] = [
    { key: 'productName', header: 'Producto', mobilePriority: 'title', accessor: (r) => <span className="font-bold">{r.productName}</span>, exportValue: (r) => r.productName },
    { key: 'sku', header: 'SKU', accessor: (r) => <span className="font-mono text-xs">{r.sku}</span> },
    { key: 'currentStock', header: 'Stock', accessor: (r) => Number(r.currentStock) },
    { key: 'daysWithoutMovement', header: 'Días sin movimiento', mobilePriority: 'highlight', accessor: (r) => <span className="font-bold text-rose-600">{r.daysWithoutMovement}</span>, exportValue: (r) => String(r.daysWithoutMovement) },
    {
      key: 'lastMovementAt',
      header: 'Último movimiento',
      accessor: (r) => r.lastMovementAt ? format(new Date(r.lastMovementAt), 'dd/MM/yyyy') : 'Nunca',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-100 p-4 rounded-2xl">
        <label className="text-sm font-bold text-slate-500">Sin movimiento en los últimos</label>
        <input type="number" min="1" max="365" value={days} onChange={(e) => setDays(Math.max(1, parseInt(e.target.value) || 60))} className="px-3 py-2 border border-slate-200 rounded-xl text-sm w-24" />
        <span className="text-sm text-slate-500">días</span>
      </div>
      <DataTable columns={columns} data={data} loading={loading} getRowId={(r) => r.productId} enableCsvExport enablePdfExport exportFileName="slow_movers" />
    </div>
  );
}
