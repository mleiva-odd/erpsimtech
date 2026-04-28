'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet,
  ArrowUpCircle, ArrowDownCircle, Plus, RefreshCw,
  ChevronLeft, ChevronRight, HandCoins, CreditCard, Download
} from 'lucide-react';
import { useBranchStore } from '@/stores/branchStore';
import { useToast } from '@/components/ui/toast';

interface Summary {
  monthlyIncome: number;
  monthlyExpense: number;
  netIncome: number;
  receivables: number;
  receivablesCount: number;
  payables: number;
  payablesCount: number;
  monthlySeries: Array<{ month: string; income: number; expense: number; net: number }>;
  expenseBreakdown: Array<{ category: string; amount: number }>;
}

interface AccountingEntry {
  id: string;
  type: string;
  description: string;
  amount: number;
  date: string;
  referenceType: string | null;
  referenceId: string | null;
  category: { name: string; type: string };
  user: { name: string };
  branch: { name: string } | null;
}

interface Category {
  id: string;
  name: string;
  type: string;
  isSystem: boolean;
}

export default function AccountingPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const { selectedBranchId } = useBranchStore();

  const role = session?.user?.role;
  const permissions = session?.user?.permissions ?? [];
  const canAccess = role === 'SUPER_ADMIN' || permissions.includes('treasury:manage');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');

  // Manual entry form
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<'INCOME' | 'EXPENSE'>('INCOME');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const branchQ = selectedBranchId ? `&branchId=${selectedBranchId}` : '';
      const [sumRes, catRes, entRes] = await Promise.all([
        fetch(`/api/accounting/summary?${branchQ}`),
        fetch(`/api/accounting/categories`),
        fetch(`/api/accounting?page=${page}&limit=20${typeFilter ? `&type=${typeFilter}` : ''}${branchQ}`),
      ]);
      const [sumData, catData, entData] = await Promise.all([
        sumRes.json(), catRes.json(), entRes.json(),
      ]);
      setSummary(sumData);
      setCategories(Array.isArray(catData) ? catData : []);
      setEntries(entData.data || []);
      setTotalPages(entData.totalPages || 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, selectedBranchId, canAccess]);

  useEffect(() => {
    if (authStatus !== 'loading') loadData();
  }, [loadData, authStatus]);

  const handleExportCSV = async () => {
    try {
      const branchQ = selectedBranchId ? `&branchId=${selectedBranchId}` : '';
      const res = await fetch(`/api/accounting?page=1&limit=10000${typeFilter ? `&type=${typeFilter}` : ''}${branchQ}`);
      const data = await res.json();
      
      const allEntries: AccountingEntry[] = data.data || [];
      
      const headers = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto'];
      const rows = allEntries.map(e => [
        format(new Date(e.date), 'dd/MM/yyyy HH:mm'),
        e.type === 'INCOME' ? 'Ingreso' : 'Egreso',
        e.category.name,
        e.description.replace(/"/g, '""'),
        e.amount.toFixed(2)
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(field => `"${field}"`).join(','))
      ].join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Reporte_Contable_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
      link.click();
      toast({ tone: 'success', message: 'Reporte exportado correctamente.' });
    } catch (e) {
      toast({ tone: 'error', message: 'Error al exportar reporte.' });
    }
  };

  const handleSubmitEntry = async () => {
    if (!formCategoryId || !formDescription.trim() || !formAmount) {
      toast({ tone: 'error', message: 'Todos los campos son obligatorios' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/accounting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          categoryId: formCategoryId,
          description: formDescription,
          amount: parseFloat(formAmount),
          date: formDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ tone: 'success', message: 'Movimiento registrado correctamente' });
      setShowForm(false);
      setFormDescription('');
      setFormAmount('');
      loadData();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (authStatus === 'loading') return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  if (!canAccess) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="rounded-3xl border border-rose-100 bg-rose-50 px-8 py-10 text-center">
          <h2 className="text-xl font-bold text-rose-700">Acceso denegado</h2>
          <p className="mt-2 text-sm text-rose-600">Solo administradores pueden acceder a contabilidad.</p>
        </div>
      </div>
    );
  }

  const filteredCats = categories.filter(c => !formType || c.type === formType);
  const maxExpense = Math.max(...(summary?.expenseBreakdown?.map(e => e.amount) || [1]));

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Contabilidad</h1>
          <p className="text-sm text-slate-500">Ingresos, egresos y estado financiero</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => router.push('/accounting/receivables')} className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-sm font-medium hover:bg-amber-100 transition">
            <HandCoins className="w-4 h-4" /> Por Cobrar
          </button>
          <button onClick={() => router.push('/accounting/payables')} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 transition">
            <CreditCard className="w-4 h-4" /> Por Pagar
          </button>
          <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-medium hover:bg-green-100 transition">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20">
            <Plus className="w-4 h-4" /> Registrar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard title="Ingresos del Mes" value={`Q${summary.monthlyIncome.toFixed(2)}`} icon={<TrendingUp className="w-5 h-5 text-green-600" />} bg="bg-green-50" color="text-green-700" />
          <KPICard title="Egresos del Mes" value={`Q${summary.monthlyExpense.toFixed(2)}`} icon={<TrendingDown className="w-5 h-5 text-red-600" />} bg="bg-red-50" color="text-red-700" />
          <KPICard title="Utilidad Neta" value={`Q${summary.netIncome.toFixed(2)}`} icon={<DollarSign className="w-5 h-5 text-blue-600" />} bg="bg-blue-50" color={summary.netIncome >= 0 ? 'text-blue-700' : 'text-red-700'} />
          <KPICard title="Cuentas por Cobrar" value={`Q${summary.receivables.toFixed(2)}`} icon={<Wallet className="w-5 h-5 text-amber-600" />} bg="bg-amber-50" color="text-amber-700" sub={`${summary.receivablesCount} clientes`} />
        </div>
      )}

      {/* Charts Row */}
      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Bar Chart */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Ingresos vs Egresos</h3>
            <div className="space-y-3">
              {summary.monthlySeries.map(m => {
                return (
                  <div key={m.month}>
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-1">
                      <span>{m.month}</span>
                      <span className={m.net >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {m.net >= 0 ? '+' : ''}Q{m.net.toFixed(0)}
                      </span>
                    </div>
                    <div className="flex gap-1 h-5">
                      <div className="bg-green-400 rounded-sm" style={{ width: `${(m.income / Math.max(...summary.monthlySeries.map(s => Math.max(s.income, s.expense)), 1)) * 100}%` }} />
                      <div className="bg-red-400 rounded-sm" style={{ width: `${(m.expense / Math.max(...summary.monthlySeries.map(s => Math.max(s.income, s.expense)), 1)) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-4 text-[10px] font-bold text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded-sm" /> Ingresos</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm" /> Egresos</span>
            </div>
          </div>

          {/* Expense Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Distribución de Gastos</h3>
            {summary.expenseBreakdown.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-8">Sin gastos este mes</div>
            ) : (
              <div className="space-y-3">
                {summary.expenseBreakdown.slice(0, 8).map(e => (
                  <div key={e.category}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">{e.category}</span>
                      <span className="font-bold text-slate-800">Q{e.amount.toFixed(2)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full" style={{ width: `${(e.amount / maxExpense) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Entries Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Movimientos</h3>
          <div className="flex gap-2">
            <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg">
              <option value="">Todos</option>
              <option value="INCOME">Ingresos</option>
              <option value="EXPENSE">Egresos</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 border-b border-slate-100">
                <th className="px-6 py-3 font-bold uppercase">Tipo</th>
                <th className="px-6 py-3 font-bold uppercase">Categoría</th>
                <th className="px-6 py-3 font-bold uppercase">Descripción</th>
                <th className="px-6 py-3 font-bold uppercase">Fecha</th>
                <th className="px-6 py-3 font-bold uppercase text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-slate-400" /></td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-sm text-slate-400">Sin movimientos registrados</td></tr>
              ) : (
                entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-3">
                      {entry.type === 'INCOME' ? (
                        <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-1 rounded-lg w-fit"><ArrowUpCircle className="w-3 h-3" /> INGRESO</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-1 rounded-lg w-fit"><ArrowDownCircle className="w-3 h-3" /> EGRESO</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600">{entry.category.name}</td>
                    <td className="px-6 py-3 text-sm text-slate-700">{entry.description}</td>
                    <td className="px-6 py-3 text-sm text-slate-500">{format(new Date(entry.date), "dd/MM/yy")}</td>
                    <td className={`px-6 py-3 text-sm font-bold text-right ${entry.type === 'INCOME' ? 'text-green-700' : 'text-red-700'}`}>
                      {entry.type === 'INCOME' ? '+' : '-'}Q{Number(entry.amount).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg border border-slate-200 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-medium text-slate-700 px-3">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg border border-slate-200 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {/* Manual Entry Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Registrar Movimiento</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <button onClick={() => { setFormType('INCOME'); setFormCategoryId(''); }} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition border ${formType === 'INCOME' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                  <ArrowUpCircle className="w-4 h-4 inline mr-1" /> Ingreso
                </button>
                <button onClick={() => { setFormType('EXPENSE'); setFormCategoryId(''); }} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition border ${formType === 'EXPENSE' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                  <ArrowDownCircle className="w-4 h-4 inline mr-1" /> Egreso
                </button>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Categoría</label>
                <select value={formCategoryId} onChange={e => setFormCategoryId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none">
                  <option value="">Seleccionar...</option>
                  {filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Descripción</label>
                <input value={formDescription} onChange={e => setFormDescription(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none" placeholder="Detalle del movimiento..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Monto (Q)</label>
                  <input type="number" step="0.01" min="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Fecha</label>
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition">Cancelar</button>
              <button onClick={handleSubmitEntry} disabled={submitting} className="flex-1 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition disabled:opacity-50">
                {submitting ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({ title, value, icon, bg, color, sub }: { title: string; value: string; icon: React.ReactNode; bg: string; color: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
          <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
          {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl ${bg} shadow-sm`}>{icon}</div>
      </div>
    </div>
  );
}
