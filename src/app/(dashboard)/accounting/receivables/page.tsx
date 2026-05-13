'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import { HandCoins, RefreshCw, User, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { bucketKeysFor } from '@/lib/ar-ap/aging';

interface CustomerAgingRow {
  customerId: string;
  customerName: string;
  customerNit: string | null;
  totalBalance: number;
  oldestDueDate: string | null;
  oldestOverdueDays: number;
  buckets: Record<string, number>;
}

interface AgingResponse {
  asOf: string;
  customers: CustomerAgingRow[];
  totals: Record<string, number>;
}

interface CompanySettingsLite {
  agingBucketDays: number[];
}

function bucketLabel(key: string): string {
  if (key === 'current') return 'Al día';
  // d{lower}_{upper} | d{lower}_plus
  const m = key.match(/^d(\d+)_(plus|\d+)$/);
  if (!m) return key;
  const [, lower, upper] = m;
  if (upper === 'plus') return `+${Number(lower) - 1} días`;
  return `${lower}–${upper} d`;
}

export default function ReceivablesPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const canManageTreasury =
    session?.user?.role === 'SUPER_ADMIN' || session?.user?.permissions?.includes('treasury:manage');

  const [aging, setAging] = useState<AgingResponse | null>(null);
  const [bucketDays, setBucketDays] = useState<number[]>([30, 60, 90]);
  const [loading, setLoading] = useState(true);

  // Modal estado de cuenta
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [statementData, setStatementData] = useState<unknown | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [resAging, resCompany] = await Promise.all([
        fetch('/api/reports/accounting/aging-receivables'),
        fetch('/api/settings/company'),
      ]);
      if (resAging.ok) {
        const data: AgingResponse = await resAging.json();
        setAging(data);
      }
      if (resCompany.ok) {
        const d: CompanySettingsLite = await resCompany.json();
        if (Array.isArray(d.agingBucketDays) && d.agingBucketDays.length > 0) {
          setBucketDays(d.agingBucketDays);
        }
      }
    } catch (e) {
      console.error(e);
      toast({ tone: 'error', message: 'Error cargando aging.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openStatement = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    setStatementData(null);
    setStatementLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/statement`);
      if (res.ok) {
        const data = await res.json();
        setStatementData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setStatementLoading(false);
    }
  };

  const closeStatement = () => {
    setSelectedCustomerId(null);
    setStatementData(null);
  };

  const dynamicBucketKeys = bucketKeysFor(bucketDays);

  const columns: DataTableColumn<CustomerAgingRow>[] = [
    {
      key: 'customer',
      header: 'Cliente',
      sortable: false,
      filterable: true,
      mobilePriority: 'title',
      accessor: (row) => (
        <div>
          <p className="font-bold text-slate-800">{row.customerName}</p>
          <p className="text-xs text-slate-500">{row.customerNit || 'Sin NIT'}</p>
        </div>
      ),
      exportValue: (row) => row.customerName,
    },
    {
      key: 'nit',
      header: 'NIT',
      mobilePriority: 'hidden',
      accessor: (row) => row.customerNit || '—',
      exportValue: (row) => row.customerNit || '',
    },
    {
      key: 'totalBalance',
      header: 'Saldo Total',
      mobilePriority: 'highlight',
      accessor: (row) => (
        <span className="font-bold text-amber-600">Q{Number(row.totalBalance).toFixed(2)}</span>
      ),
      exportValue: (row) => Number(row.totalBalance).toFixed(2),
      cellClassName: 'text-right',
      headerClassName: 'text-right',
    },
    ...dynamicBucketKeys.map<DataTableColumn<CustomerAgingRow>>((bk) => ({
      key: bk,
      header: bucketLabel(bk),
      accessor: (row) =>
        row.buckets[bk] && row.buckets[bk] > 0 ? `Q${Number(row.buckets[bk]).toFixed(2)}` : '—',
      exportValue: (row) =>
        row.buckets[bk] && row.buckets[bk] > 0 ? Number(row.buckets[bk]).toFixed(2) : '0.00',
      cellClassName: 'text-right text-sm',
      headerClassName: 'text-right',
      mobilePriority: 'meta',
    })),
    {
      key: 'oldestOverdueDays',
      header: 'Vencido más antiguo',
      mobilePriority: 'meta',
      accessor: (row) =>
        row.oldestOverdueDays > 0 ? (
          <span className="text-rose-600 font-bold">{row.oldestOverdueDays}d</span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
      exportValue: (row) => row.oldestOverdueDays.toString(),
      cellClassName: 'text-right',
      headerClassName: 'text-right',
    },
  ];

  const customers = aging?.customers ?? [];
  const total = aging?.totals.total ?? 0;
  const overdue = customers.filter((c) => c.oldestOverdueDays > 0).length;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <HandCoins className="w-6 h-6 text-amber-600" /> Cuentas por Cobrar · Aging
          </h1>
          <p className="text-sm text-slate-500">
            Antigüedad de saldos por cliente {aging?.asOf && `· al ${format(new Date(aging.asOf), 'dd/MM/yyyy')}`}
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          aria-label="Recargar"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-5 text-white shadow-lg shadow-amber-500/20">
          <p className="text-amber-100 text-xs font-bold uppercase tracking-widest">Total por Cobrar</p>
          <p className="text-2xl font-bold mt-2">Q{Number(total).toFixed(2)}</p>
          <p className="text-amber-100 text-sm mt-1">{customers.length} clientes con saldo</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Al día</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">
            Q{Number(aging?.totals.current ?? 0).toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-rose-100 shadow-sm">
          <p className="text-rose-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" /> Clientes vencidos
          </p>
          <p className="text-2xl font-bold text-rose-600 mt-2">{overdue}</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={customers}
        loading={loading}
        enableCsvExport
        enablePdfExport
        exportFileName="aging_receivables"
        emptyMessage="No hay clientes con saldo pendiente."
        onRowClick={canManageTreasury ? (row) => openStatement(row.customerId) : undefined}
      />

      {/* Statement Modal */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Estado de cuenta</h2>
                  <p className="text-xs text-slate-500">
                    {customers.find((c) => c.customerId === selectedCustomerId)?.customerName}
                  </p>
                </div>
              </div>
              <button onClick={closeStatement} className="px-3 py-1.5 rounded-xl text-slate-500 text-sm hover:bg-slate-100">
                Cerrar
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {statementLoading ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : statementData ? (
                <pre className="text-xs bg-slate-50 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(statementData, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-slate-500 text-center py-12">
                  No se pudo cargar el estado de cuenta.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
