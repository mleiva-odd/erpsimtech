'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { CreditCard, RefreshCw, Truck, AlertTriangle, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/ui/toast';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { bucketKeysFor } from '@/lib/ar-ap/aging';

interface SupplierAgingRow {
  supplierId: string;
  supplierName: string;
  supplierNit: string | null;
  totalBalance: number;
  oldestDueDate: string | null;
  oldestOverdueDays: number;
  buckets: Record<string, number>;
}

interface AgingResponse {
  asOf: string;
  suppliers: SupplierAgingRow[];
  totals: Record<string, number>;
}

interface CompanySettingsLite {
  agingBucketDays: number[];
}

function bucketLabel(key: string): string {
  if (key === 'current') return 'Al día';
  const m = key.match(/^d(\d+)_(plus|\d+)$/);
  if (!m) return key;
  const [, lower, upper] = m;
  if (upper === 'plus') return `+${Number(lower) - 1} días`;
  return `${lower}–${upper} d`;
}

export default function PayablesPage() {
  const { toast } = useToast();
  const [aging, setAging] = useState<AgingResponse | null>(null);
  const [bucketDays, setBucketDays] = useState<number[]>([30, 60, 90]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [resAging, resCompany] = await Promise.all([
        fetch('/api/reports/accounting/aging-payables'),
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

  const dynamicBucketKeys = bucketKeysFor(bucketDays);

  const columns: DataTableColumn<SupplierAgingRow>[] = [
    {
      key: 'supplier',
      header: 'Proveedor',
      filterable: true,
      mobilePriority: 'title',
      accessor: (row) => (
        <div>
          <p className="font-bold text-slate-800">{row.supplierName}</p>
          <p className="text-xs text-slate-500">{row.supplierNit || 'Sin NIT'}</p>
        </div>
      ),
      exportValue: (row) => row.supplierName,
    },
    {
      key: 'nit',
      header: 'NIT',
      mobilePriority: 'hidden',
      accessor: (row) => row.supplierNit || '—',
      exportValue: (row) => row.supplierNit || '',
    },
    {
      key: 'totalBalance',
      header: 'Saldo Total',
      mobilePriority: 'highlight',
      accessor: (row) => (
        <span className="font-bold text-rose-600">Q{Number(row.totalBalance).toFixed(2)}</span>
      ),
      exportValue: (row) => Number(row.totalBalance).toFixed(2),
      cellClassName: 'text-right',
      headerClassName: 'text-right',
    },
    ...dynamicBucketKeys.map<DataTableColumn<SupplierAgingRow>>((bk) => ({
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

  const suppliers = aging?.suppliers ?? [];
  const total = aging?.totals.total ?? 0;
  const overdue = suppliers.filter((s) => s.oldestOverdueDays > 0).length;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <CreditCard className="w-6 h-6 text-rose-600" /> Cuentas por Pagar · Aging
          </h1>
          <p className="text-sm text-slate-500">
            Antigüedad de saldos por proveedor {aging?.asOf && `· al ${format(new Date(aging.asOf), 'dd/MM/yyyy')}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/accounting/payables/aging"
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-medium hover:bg-rose-700 transition"
            aria-label="Ver antigüedad de saldos con drill-down"
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Antigüedad detallada</span>
            <span className="sm:hidden">Antigüedad</span>
          </Link>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            aria-label="Recargar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-r from-rose-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg shadow-rose-500/20">
          <p className="text-rose-100 text-xs font-bold uppercase tracking-widest">Total por Pagar</p>
          <p className="text-2xl font-bold mt-2">Q{Number(total).toFixed(2)}</p>
          <p className="text-rose-100 text-sm mt-1 flex items-center gap-1">
            <Truck className="w-3 h-3" /> {suppliers.length} proveedores con saldo
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Al día</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">
            Q{Number(aging?.totals.current ?? 0).toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-rose-100 shadow-sm">
          <p className="text-rose-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" /> Proveedores vencidos
          </p>
          <p className="text-2xl font-bold text-rose-600 mt-2">{overdue}</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={suppliers}
        loading={loading}
        enableCsvExport
        enablePdfExport
        exportFileName="aging_payables"
        emptyMessage="No hay proveedores con saldo pendiente."
      />
    </div>
  );
}
