'use client';

/**
 * Fase 22b · Sales con DataTable + useDataTable.
 *
 * Endpoint `/api/sales` ya soporta paginación servidor + filtros
 * (status, channel, dateFrom, dateTo, search). KPIs siguen viviendo en
 * `/api/sales/stats` y se recalculan cuando cambian los filtros.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Receipt, FileText, RefreshCw, TrendingUp, ArrowDownRight, DollarSign,
  Eye, Printer, Wifi, Filter as FilterIcon,
} from 'lucide-react';
import { useBranchStore } from '@/stores/branchStore';
import { TicketModal } from '@/components/pos/TicketModal';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface SaleItem {
  id: string;
  quantity: number;
  unitPrice: number;
  product: { name: string; sku: string };
  variant?: { name: string } | null;
}
interface Payment {
  method: string;
  amount: number;
  reference: string | null;
}
interface SaleReturn { id: string; amount: number; createdAt: string; }
interface Sale {
  id: string;
  total: number;
  subtotal: number;
  discount: number;
  status: string;
  channel: string;
  createdAt: string;
  user: { id: string; name: string };
  customer: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
  payments: Payment[];
  items: SaleItem[];
  returns: SaleReturn[];
}
interface Stats {
  totalSales: number;
  totalReturns: number;
  netSales: number;
  avgTicket: number;
  salesCount: number;
  returnsCount: number;
}

const CHANNEL_LABELS: Record<string, string> = { POS: 'POS', REMOTE: 'Remota', WEB: 'Web' };
const CHANNEL_COLORS: Record<string, string> = {
  POS: 'bg-green-100 text-green-700',
  REMOTE: 'bg-purple-100 text-purple-700',
  WEB: 'bg-sky-100 text-sky-700',
};
const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Completada',
  CANCELLED: 'Anulada',
  QUOTE: 'Cotización',
  PENDING: 'Pendiente',
  ORDER: 'Pedido',
  PARTIALLY_DELIVERED: 'Parc. despachado',
  DELIVERED: 'Despachado',
  INVOICED: 'Facturado',
};
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  QUOTE: 'bg-blue-100 text-blue-700',
  PENDING: 'bg-amber-100 text-amber-700',
  ORDER: 'bg-indigo-100 text-indigo-700',
  PARTIALLY_DELIVERED: 'bg-amber-100 text-amber-700',
  DELIVERED: 'bg-sky-100 text-sky-700',
  INVOICED: 'bg-emerald-100 text-emerald-700',
};
const METHOD_LABELS: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', CREDIT: 'Crédito' };

export default function SalesPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const { selectedBranchId } = useBranchStore();

  const role = session?.user?.role;
  const permissions = useMemo(() => session?.user?.permissions || [], [session]);
  const canAccess = role === 'SUPER_ADMIN' || permissions.includes('sales:view') || permissions.includes('reports:view');

  const [stats, setStats] = useState<Stats | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [ticketSaleId, setTicketSaleId] = useState<string | null>(null);

  const table = useDataTable<Sale>({
    defaultLimit: 25,
    autoLoad: canAccess,
    onFetch: async ({ page, limit, search, filters, signal }) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search.trim()) params.set('search', search.trim());
      if (filters.status) params.set('status', String(filters.status));
      if (filters.channel) params.set('channel', String(filters.channel));
      if (filters.dateFrom) params.set('dateFrom', String(filters.dateFrom));
      if (filters.dateTo) params.set('dateTo', String(filters.dateTo));
      if (selectedBranchId) params.set('branchId', selectedBranchId);

      const res = await fetch(`/api/sales?${params}`, { signal });
      if (!res.ok) throw new Error('Error al cargar ventas.');
      const json = await res.json();
      return { data: json.data ?? [], total: json.total ?? 0 };
    },
  });

  const loadStats = useCallback(async () => {
    if (!canAccess) return;
    try {
      const params = new URLSearchParams();
      if (table.filters.dateFrom) params.set('dateFrom', String(table.filters.dateFrom));
      if (table.filters.dateTo) params.set('dateTo', String(table.filters.dateTo));
      if (table.filters.channel) params.set('channel', String(table.filters.channel));
      if (selectedBranchId) params.set('branchId', selectedBranchId);
      const res = await fetch(`/api/sales/stats?${params}`);
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [canAccess, table.filters, selectedBranchId]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  if (authStatus === 'loading') {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="rounded-3xl border border-rose-100 bg-rose-50 px-8 py-10 text-center">
          <h2 className="text-xl font-bold text-rose-700">Acceso denegado</h2>
          <p className="mt-2 text-sm text-rose-600">No tienes permisos para acceder al módulo de ventas.</p>
        </div>
      </div>
    );
  }

  const columns: DataTableColumn<Sale>[] = [
    {
      key: 'ticket',
      header: 'Ticket',
      mobilePriority: 'title',
      accessor: (sale) => (
        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
          #{sale.id.split('-')[0].toUpperCase()}
        </span>
      ),
      exportValue: (sale) => sale.id.split('-')[0].toUpperCase(),
    },
    {
      key: 'createdAt',
      header: 'Fecha',
      mobilePriority: 'meta',
      accessor: (sale) => (
        <span className="text-sm text-slate-600">
          {format(new Date(sale.createdAt), 'dd MMM, HH:mm', { locale: es })}
        </span>
      ),
      exportValue: (sale) => format(new Date(sale.createdAt), 'dd/MM/yyyy HH:mm'),
    },
    {
      key: 'customer',
      header: 'Cliente',
      mobilePriority: 'meta',
      accessor: (sale) => sale.customer?.name || <span className="text-slate-400 italic">C/F</span>,
      exportValue: (sale) => sale.customer?.name || 'C/F',
    },
    {
      key: 'channel',
      header: 'Canal',
      mobilePriority: 'hidden',
      accessor: (sale) => (
        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${CHANNEL_COLORS[sale.channel] || 'bg-slate-100 text-slate-600'}`}>
          {CHANNEL_LABELS[sale.channel] || sale.channel}
        </span>
      ),
      exportValue: (sale) => CHANNEL_LABELS[sale.channel] || sale.channel,
    },
    {
      key: 'user',
      header: 'Vendedor',
      mobilePriority: 'hidden',
      accessor: (sale) => sale.user?.name,
      exportValue: (sale) => sale.user?.name ?? '',
    },
    {
      key: 'method',
      header: 'Método',
      mobilePriority: 'hidden',
      accessor: (sale) => (
        <div className="flex flex-wrap gap-1">
          {sale.payments?.map((p, i) => (
            <span key={i} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
              {METHOD_LABELS[p.method] || p.method}
            </span>
          ))}
        </div>
      ),
      exportValue: (sale) => sale.payments?.map((p) => METHOD_LABELS[p.method] || p.method).join(' / ') ?? '',
    },
    {
      key: 'total',
      header: 'Total',
      mobilePriority: 'highlight',
      cellClassName: 'text-right',
      headerClassName: 'text-right',
      accessor: (sale) => (
        <div className="text-right">
          <span className="font-bold text-slate-800">Q{Number(sale.total).toFixed(2)}</span>
          {sale.returns?.length > 0 && (
            <div className="text-[10px] text-red-500 font-medium">-{sale.returns.length} dev.</div>
          )}
        </div>
      ),
      exportValue: (sale) => Number(sale.total).toFixed(2),
    },
    {
      key: 'status',
      header: 'Estado',
      mobilePriority: 'meta',
      accessor: (sale) => (
        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${STATUS_COLORS[sale.status] || 'bg-slate-100'}`}>
          {STATUS_LABELS[sale.status] || sale.status}
        </span>
      ),
      exportValue: (sale) => STATUS_LABELS[sale.status] || sale.status,
    },
    {
      key: 'actions',
      header: 'Acciones',
      mobilePriority: 'hidden',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (sale) => (
        <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => router.push(`/sales/${sale.id}`)}
            className="p-2 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition"
            aria-label="Ver detalle"
            title="Ver detalle"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTicketSaleId(sale.id)}
            className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition"
            aria-label="Reimprimir"
            title="Reimprimir"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      ),
      exportValue: () => '',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Ventas' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestión de Ventas</h1>
          <p className="text-sm text-slate-500">Historial, devoluciones y ventas remotas</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => router.push('/sales/new')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition font-bold text-sm shadow-md shadow-purple-600/20"
          >
            <Wifi className="w-4 h-4" /> Nueva Venta
          </button>
          <button
            onClick={() => router.push('/sales/delivery-notes')}
            className="flex items-center gap-2 px-4 py-2 bg-sky-50 text-sky-700 border border-sky-200 rounded-xl hover:bg-sky-100 transition font-medium text-sm"
          >
            <FileText className="w-4 h-4" /> Notas de Envío
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition font-medium text-sm border ${
              showFilters ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <FilterIcon className="w-4 h-4" /> Filtros
          </button>
          <button
            onClick={() => {
              void table.refetch();
              void loadStats();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition font-medium text-sm"
            aria-label="Recargar"
          >
            <RefreshCw className={`w-4 h-4 ${table.loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard title="Total Vendido" value={`Q${stats.totalSales.toFixed(2)}`} sub={`${stats.salesCount} ventas`} icon={<TrendingUp className="w-5 h-5 text-green-600" />} bg="bg-green-50" />
          <KPICard title="Ticket Promedio" value={`Q${stats.avgTicket.toFixed(2)}`} sub="por transacción" icon={<Receipt className="w-5 h-5 text-blue-600" />} bg="bg-blue-50" />
          <KPICard title="Devoluciones" value={`Q${stats.totalReturns.toFixed(2)}`} sub={`${stats.returnsCount} devoluciones`} icon={<ArrowDownRight className="w-5 h-5 text-red-600" />} bg="bg-red-50" />
          <KPICard title="Neto" value={`Q${stats.netSales.toFixed(2)}`} sub="ventas - devoluciones" icon={<DollarSign className="w-5 h-5 text-emerald-600" />} bg="bg-emerald-50" />
        </div>
      )}

      {/* Filters Panel (toggle) */}
      {showFilters && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Estado</label>
              <select
                value={(table.filters.status as string) ?? ''}
                onChange={(e) => table.setFilter('status', e.target.value || null)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none"
              >
                <option value="">Todos</option>
                <option value="COMPLETED">Completada</option>
                <option value="CANCELLED">Anulada</option>
                <option value="QUOTE">Cotización</option>
                <option value="ORDER">Pedido</option>
                <option value="PARTIALLY_DELIVERED">Parcialmente despachado</option>
                <option value="DELIVERED">Despachado</option>
                <option value="INVOICED">Facturado</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Canal</label>
              <select
                value={(table.filters.channel as string) ?? ''}
                onChange={(e) => table.setFilter('channel', e.target.value || null)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none"
              >
                <option value="">Todos</option>
                <option value="POS">POS (Tienda)</option>
                <option value="REMOTE">Remota</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Desde</label>
              <input
                type="date"
                value={(table.filters.dateFrom as string) ?? ''}
                onChange={(e) => table.setFilter('dateFrom', e.target.value || null)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Hasta</label>
              <input
                type="date"
                value={(table.filters.dateTo as string) ?? ''}
                onChange={(e) => table.setFilter('dateTo', e.target.value || null)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                table.clearFilters();
                table.search.onChange('');
              }}
              className="text-xs font-bold text-slate-500 hover:text-rose-600 transition"
            >
              Limpiar filtros
            </button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={table.data}
        loading={table.loading}
        total={table.pagination.total}
        page={table.pagination.page}
        pageSize={table.pagination.limit}
        onPageChange={table.pagination.onPageChange}
        onPageSizeChange={table.pagination.onLimitChange}
        getRowId={(sale) => sale.id}
        search={{
          value: table.search.value,
          onChange: table.search.onChange,
          placeholder: 'Buscar por ticket, cliente...',
        }}
        empty={
          <EmptyState
            icon={<Receipt className="w-7 h-7" />}
            title="Sin ventas"
            description="No hay ventas que coincidan con los filtros aplicados."
          />
        }
      />

      {ticketSaleId && (
        <TicketModal saleId={ticketSaleId} onClose={() => setTicketSaleId(null)} />
      )}
    </div>
  );

  function KPICard({ title, value, sub, icon, bg }: { title: string; value: string; sub: string; icon: React.ReactNode; bg: string }) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
            <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
          </div>
          <div className={`p-2.5 rounded-xl ${bg} shadow-sm`}>{icon}</div>
        </div>
        <p className="text-[11px] text-slate-500 font-medium mt-3">{sub}</p>
      </div>
    );
  }
}
