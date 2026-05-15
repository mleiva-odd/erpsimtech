'use client';

/**
 * Fase 22b · Reportes de ventas.
 */

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Users, Award, Trophy } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

type TabKey = 'by-user' | 'products-top' | 'customers-top';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'by-user', label: 'Ventas por usuario', icon: <Award className="w-4 h-4" /> },
  { key: 'products-top', label: 'Productos top', icon: <Trophy className="w-4 h-4" /> },
  { key: 'customers-top', label: 'Clientes top', icon: <Users className="w-4 h-4" /> },
];

function formatQ(n: number | string): string {
  return `Q${Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SalesReportsPage() {
  const [tab, setTab] = useState<TabKey>('by-user');

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Reportes', href: '/reports' },
          { label: 'Ventas' },
        ]}
        className="mb-6"
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-blue-600" /> Reportes de ventas
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

      {tab === 'by-user' && <ByUserTab />}
      {tab === 'products-top' && <ProductsTopTab />}
      {tab === 'customers-top' && <CustomersTopTab />}
    </div>
  );
}

function DateRangeFilters({
  from, to, onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 bg-white border border-slate-100 p-4 rounded-2xl mb-4">
      <div>
        <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Desde</label>
        <input type="date" value={from} onChange={(e) => onChange(e.target.value, to)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Hasta</label>
        <input type="date" value={to} onChange={(e) => onChange(from, e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm" />
      </div>
    </div>
  );
}

interface ByUserRow { userId: string; userName: string; salesCount: number; revenue: number; cost: number; avgTicket: number }

function ByUserTab() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<ByUserRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/reports/sales/by-user?${params}`);
      const json = await res.json();
      setData(Array.isArray(json?.users) ? json.users : Array.isArray(json) ? json : []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const columns: DataTableColumn<ByUserRow>[] = [
    { key: 'userName', header: 'Usuario', mobilePriority: 'title', accessor: (r) => <span className="font-bold">{r.userName}</span>, exportValue: (r) => r.userName },
    { key: 'salesCount', header: '# Ventas', accessor: (r) => Number(r.salesCount) },
    { key: 'revenue', header: 'Ingreso', mobilePriority: 'highlight', accessor: (r) => <span className="font-bold text-emerald-600">{formatQ(r.revenue)}</span>, exportValue: (r) => formatQ(r.revenue) },
    { key: 'avgTicket', header: 'Ticket prom.', accessor: (r) => formatQ(r.avgTicket), exportValue: (r) => formatQ(r.avgTicket) },
    { key: 'cost', header: 'Costo', accessor: (r) => formatQ(r.cost), exportValue: (r) => formatQ(r.cost) },
  ];

  return (
    <>
      <DateRangeFilters from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <DataTable columns={columns} data={data} loading={loading} getRowId={(r) => r.userId} enableCsvExport enablePdfExport exportFileName="ventas_por_usuario" />
    </>
  );
}

interface ProductTopRow { name: string; sku: string; quantity: number; revenue: number; cost: number; profit: number }

function ProductsTopTab() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<ProductTopRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, limit: '50' });
      const res = await fetch(`/api/reports/products/top?${params}`);
      const json = await res.json();
      setData(Array.isArray(json?.products) ? json.products : Array.isArray(json) ? json : []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const columns: DataTableColumn<ProductTopRow>[] = [
    { key: 'name', header: 'Producto', mobilePriority: 'title', accessor: (r) => <span className="font-bold">{r.name}</span>, exportValue: (r) => r.name },
    { key: 'sku', header: 'SKU', accessor: (r) => <span className="font-mono text-xs">{r.sku}</span> },
    { key: 'quantity', header: 'Unidades', accessor: (r) => Number(r.quantity) },
    { key: 'revenue', header: 'Ingreso', mobilePriority: 'highlight', accessor: (r) => formatQ(r.revenue), exportValue: (r) => formatQ(r.revenue) },
    { key: 'profit', header: 'Margen', accessor: (r) => <span className="font-bold text-emerald-600">{formatQ(r.profit)}</span>, exportValue: (r) => formatQ(r.profit) },
  ];

  return (
    <>
      <DateRangeFilters from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <DataTable columns={columns} data={data} loading={loading} getRowId={(r) => r.sku} enableCsvExport enablePdfExport exportFileName="productos_top" />
    </>
  );
}

interface CustomerTopRow { customerId: string; name: string; nit?: string | null; salesCount: number; totalSpent: number; lastPurchaseAt?: string | null }

function CustomersTopTab() {
  const [from, setFrom] = useState(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<CustomerTopRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, limit: '50' });
      const res = await fetch(`/api/reports/customers/top?${params}`);
      const json = await res.json();
      setData(Array.isArray(json?.customers) ? json.customers : Array.isArray(json) ? json : []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const columns: DataTableColumn<CustomerTopRow>[] = [
    { key: 'name', header: 'Cliente', mobilePriority: 'title', accessor: (r) => <span className="font-bold">{r.name}</span>, exportValue: (r) => r.name },
    { key: 'nit', header: 'NIT', accessor: (r) => r.nit || '—' },
    { key: 'salesCount', header: '# Compras', accessor: (r) => Number(r.salesCount) },
    { key: 'totalSpent', header: 'Total', mobilePriority: 'highlight', accessor: (r) => <span className="font-bold text-emerald-600">{formatQ(r.totalSpent)}</span>, exportValue: (r) => formatQ(r.totalSpent) },
  ];

  return (
    <>
      <DateRangeFilters from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <DataTable columns={columns} data={data} loading={loading} getRowId={(r) => r.customerId} enableCsvExport enablePdfExport exportFileName="clientes_top" />
    </>
  );
}
