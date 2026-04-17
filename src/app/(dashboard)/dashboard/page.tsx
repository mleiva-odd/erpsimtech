'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowUpRight, DollarSign, Package, AlertTriangle, Activity, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useBranchStore } from '@/stores/branchStore';

interface DashboardStats {
  revenueToday: number;
  salesCountToday: number;
  totalProducts: number;
  lowStockProducts: number;
  recentSales: { id: string; total: string; createdAt: string; user: { name: string }; branch?: { name: string } }[];
}

interface ChartData {
  dailySales: { date: string; total: number; count: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  paymentMethods: { method: string; total: number; count: number }[];
  salesByBranch: { name: string; total: number; count: number }[];
}

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia',
};

function formatTooltipCurrency(value: string | number | readonly (string | number)[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;
  return `Q${Number(normalized ?? 0).toFixed(2)}`;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [charts, setCharts] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { selectedBranchId } = useBranchStore();
  const role = session?.user?.role;
  const canAccess = role === 'SUPERVISOR' || role === 'ADMIN' || role === 'SUPER_ADMIN';

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    if (!canAccess) {
      setStats(null);
      setCharts(null);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;

    async function loadDashboard() {
      setLoading(true);
      const branchQuery = selectedBranchId ? `?branchId=${selectedBranchId}` : '';

      try {
        setError(null);
        const [statsResponse, chartsResponse] = await Promise.all([
          fetch(`/api/dashboard${branchQuery}`),
          fetch(`/api/dashboard/charts${branchQuery}`),
        ]);
        const [statsData, chartsData] = await Promise.all([
          statsResponse.json(),
          chartsResponse.json(),
        ]);

        if (!active) return;

        if (!statsResponse.ok) {
          setStats(null);
          setCharts(null);
          setError(statsData.error || 'No fue posible cargar el dashboard.');
          return;
        }

        setStats({
          revenueToday: statsData.revenueToday ?? 0,
          salesCountToday: statsData.salesCountToday ?? 0,
          totalProducts: statsData.totalProducts ?? 0,
          lowStockProducts: statsData.lowStockProducts ?? 0,
          recentSales: statsData.recentSales ?? [],
        });
        setCharts(chartsResponse.ok && !chartsData.error ? chartsData : null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [selectedBranchId, status, canAccess]);

  if (status === 'loading') {
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
          <p className="mt-2 text-sm text-rose-600">No tienes permisos para ver métricas del negocio.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="rounded-3xl border border-rose-100 bg-rose-50 px-8 py-10 text-center">
          <h2 className="text-xl font-bold text-rose-700">Error cargando métricas</h2>
          <p className="mt-2 text-sm text-rose-600">{error}</p>
        </div>
      </div>
    );
  }

  if (loading || !stats) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Resumen del Día</h1>
        <p className="text-sm text-slate-500">Métricas clave y estado de la tienda</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Ventas de Hoy"
          val={`Q${(stats.revenueToday ?? 0).toFixed(2)}`}
          sub={`${stats.salesCountToday} transacciones`}
          icon={<DollarSign className="w-5 h-5 text-green-600" />}
          bg="bg-green-50"
        />
        <KPICard
          title="Productos Activos"
          val={stats.totalProducts}
          sub="En inventario global"
          icon={<Package className="w-5 h-5 text-blue-600" />}
          bg="bg-blue-50"
        />
        <KPICard
          title="Alertas de Stock"
          val={stats.lowStockProducts}
          sub="Reabastecimiento pendiente"
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
          bg="bg-amber-50"
          alert={stats.lowStockProducts > 0}
        />
        <KPICard
          title="Estado del Sistema"
          val="Óptimo"
          sub="Sincronización en tiempo real"
          icon={<Activity className="w-5 h-5 text-indigo-600" />}
          bg="bg-indigo-50"
        />
      </div>

      {/* Charts Row */}
      {charts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily Sales Bar Chart */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <h2 className="font-bold text-slate-800 tracking-tight">Rendimiento Semanal</h2>
            </div>
            {charts.dailySales.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={charts.dailySales}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={v => `Q${v}`} />
                  <Tooltip
                    formatter={(value) => [formatTooltipCurrency(value), 'Total']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }}
                  />
                  <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-slate-300 text-sm">
                Sin datos para mostrar
              </div>
            )}
          </div>

          {/* Payment Methods Pie Chart */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
            <h2 className="font-bold text-slate-800 mb-6 tracking-tight">Distribución de Pagos</h2>
            {charts.paymentMethods.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={charts.paymentMethods.map(pm => ({
                      ...pm,
                      name: PAYMENT_LABELS[pm.method] || pm.method,
                    }))}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={90}
                    paddingAngle={5}
                    dataKey="total"
                    nameKey="name"
                  >
                    {charts.paymentMethods.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [formatTooltipCurrency(value)]} />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: '12px' }}
                    formatter={(value) => <span className="text-slate-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-slate-300 text-sm">
                Sin datos de pagos
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Products + Recent Sales Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        {charts && charts.topProducts.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-50">
              <h2 className="font-bold text-slate-800 tracking-tight">Productos de Mayor Rotación</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {charts.topProducts.map((product, idx) => (
                <div key={idx} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
                      idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-400' : 'bg-orange-400'
                    }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{product.name}</p>
                      <p className="text-xs text-slate-600">{product.quantity} vendidos</p>
                    </div>
                  </div>
                  <span className="font-bold text-slate-700">Q{product.revenue.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Sales */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 tracking-tight">Actividad Reciente</h2>
            <a href="/reports" className="text-xs text-blue-600 hover:text-blue-700 font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors">
              Historial Completo <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.recentSales.length > 0 ? (
              stats.recentSales.map((sale) => (
                <div key={sale.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Venta #{sale.id.slice(-6).toUpperCase()}</p>
                    <p className="text-xs text-slate-500">
                      {sale.user.name} {sale.branch ? `· ${sale.branch.name}` : ''} · {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-800">Q{Number(sale.total).toFixed(2)}</p>
                    <span className="inline-flex mt-1 items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
                      Completado
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-slate-600 text-sm">
                No hay ventas registradas el día de hoy.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, val, sub, icon, bg, alert }: { title: string, val: string | number, sub: string, icon: React.ReactNode, bg: string, alert?: boolean }) {
  return (
    <div className={`rounded-3xl border ${alert ? 'border-amber-200 bg-amber-50/20' : 'border-slate-100 bg-white'} p-7 shadow-sm transition-all hover:shadow-md flex flex-col`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-3">{title}</p>
          <p className="text-3xl font-bold text-slate-900 tracking-tight">{val}</p>
        </div>
        <div className={`p-2.5 rounded-2xl ${bg} flex items-center justify-center shadow-sm`}>
          {icon}
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2">
        <div className={`w-1 h-3 rounded-full ${alert ? 'bg-amber-500' : 'bg-slate-200'}`}></div>
        <p className={`text-[11px] ${alert ? 'text-amber-600 font-bold' : 'text-slate-500 font-medium'}`}>
          {sub}
        </p>
      </div>
    </div>
  );
}
