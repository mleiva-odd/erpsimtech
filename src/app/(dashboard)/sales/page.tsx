'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Receipt, Search, Filter, FileText, RefreshCw,
  TrendingUp, ArrowDownRight, DollarSign,
  ChevronLeft, ChevronRight, Eye, Printer, Wifi
} from 'lucide-react';
import { useBranchStore } from '@/stores/branchStore';
import { useToast } from '@/components/ui/toast';
import { TicketModal } from '@/components/pos/TicketModal';

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

interface SaleReturn {
  id: string;
  amount: number;
  createdAt: string;
}

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
  const { toast } = useToast();
  const { selectedBranchId } = useBranchStore();

  const role = session?.user?.role;
  const permissions = session?.user?.permissions || [];
  const canAccess = role === 'SUPER_ADMIN' || permissions.includes('sales:view') || permissions.includes('reports:view');

  const [sales, setSales] = useState<Sale[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Modals
  const [ticketSaleId, setTicketSaleId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!canAccess) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '25');
      if (statusFilter) params.set('status', statusFilter);
      if (channelFilter) params.set('channel', channelFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (search.trim()) params.set('search', search.trim());
      if (selectedBranchId) params.set('branchId', selectedBranchId);

      const statsParams = new URLSearchParams();
      if (dateFrom) statsParams.set('dateFrom', dateFrom);
      if (dateTo) statsParams.set('dateTo', dateTo);
      if (channelFilter) statsParams.set('channel', channelFilter);
      if (selectedBranchId) statsParams.set('branchId', selectedBranchId);

      const [salesRes, statsRes] = await Promise.all([
        fetch(`/api/sales?${params}`),
        fetch(`/api/sales/stats?${statsParams}`),
      ]);

      const salesData = await salesRes.json();
      const statsData = await statsRes.json();

      setSales(salesData.data || []);
      setTotal(salesData.total || 0);
      setTotalPages(salesData.totalPages || 1);
      setStats(statsData);
    } catch (e) {
      console.error(e);
      toast({ tone: 'error', message: 'Error cargando datos de ventas.' });
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, channelFilter, dateFrom, dateTo, search, selectedBranchId, canAccess, toast]);

  useEffect(() => {
    if (authStatus !== 'loading') loadData();
  }, [loadData, authStatus]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-8">
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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition font-medium text-sm border ${showFilters ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            <Filter className="w-4 h-4" /> Filtros
          </button>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition font-medium text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
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

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Estado</label>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 focus:ring-1 focus:ring-blue-200 outline-none">
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
              <select value={channelFilter} onChange={e => { setChannelFilter(e.target.value); setPage(1); }} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 focus:ring-1 focus:ring-blue-200 outline-none">
                <option value="">Todos</option>
                <option value="POS">POS (Tienda)</option>
                <option value="REMOTE">Remota</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Desde</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 focus:ring-1 focus:ring-blue-200 outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Hasta</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 focus:ring-1 focus:ring-blue-200 outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setStatusFilter('COMPLETED'); setChannelFilter(''); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1); }} className="text-xs font-bold text-slate-500 hover:text-rose-600 transition">
              Limpiar filtros
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ticket, cliente..."
            className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl text-sm focus:border-blue-300 focus:ring-1 focus:ring-blue-200 outline-none bg-white"
          />
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-100">
                <th className="px-5 py-4 font-bold uppercase tracking-wider">Ticket</th>
                <th className="px-5 py-4 font-bold uppercase tracking-wider">Fecha</th>
                <th className="px-5 py-4 font-bold uppercase tracking-wider">Cliente</th>
                <th className="px-5 py-4 font-bold uppercase tracking-wider">Canal</th>
                <th className="px-5 py-4 font-bold uppercase tracking-wider">Vendedor</th>
                <th className="px-5 py-4 font-bold uppercase tracking-wider">Método</th>
                <th className="px-5 py-4 font-bold uppercase tracking-wider text-right">Total</th>
                <th className="px-5 py-4 font-bold uppercase tracking-wider">Estado</th>
                <th className="px-5 py-4 font-bold uppercase tracking-wider text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-400"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-400 text-sm">No hay ventas que coincidan con los filtros.</td></tr>
              ) : (
                sales.map(sale => (
                  <tr key={sale.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                        #{sale.id.split('-')[0].toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600">
                      {format(new Date(sale.createdAt), "dd MMM, HH:mm", { locale: es })}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-700 font-medium">
                      {sale.customer?.name || <span className="text-slate-400 italic">C/F</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${CHANNEL_COLORS[sale.channel] || 'bg-slate-100 text-slate-600'}`}>
                        {CHANNEL_LABELS[sale.channel] || sale.channel}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600">{sale.user?.name}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {sale.payments?.map((p, i) => (
                          <span key={i} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            {METHOD_LABELS[p.method] || p.method}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-bold text-slate-800">Q{Number(sale.total).toFixed(2)}</span>
                      {sale.returns?.length > 0 && (
                        <div className="text-[10px] text-red-500 font-medium">
                          -{sale.returns.length} dev.
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${STATUS_COLORS[sale.status] || 'bg-slate-100'}`}>
                        {STATUS_LABELS[sale.status] || sale.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => router.push(`/sales/${sale.id}`)}
                          className="p-2 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition"
                          title="Ver detalle"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setTicketSaleId(sale.id)}
                          className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition"
                          title="Reimprimir"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              Mostrando {sales.length} de {total} ventas
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-slate-700 px-3">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ticket Reprint Modal */}
      {ticketSaleId && (
        <TicketModal saleId={ticketSaleId} onClose={() => setTicketSaleId(null)} />
      )}
    </div>
  );
}

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
