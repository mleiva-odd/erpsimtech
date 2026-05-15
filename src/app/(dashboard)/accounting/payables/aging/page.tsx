'use client';

/**
 * Fase 22c-1 · Pantalla de Antigüedad de Saldos · Cuentas por Pagar.
 *
 * Misma estructura que la pantalla de CxC, adaptada a proveedores
 * y al endpoint /api/payables/aging (aging exacto por payable).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  CreditCard,
  RefreshCw,
  AlertTriangle,
  Download,
  ChevronDown,
  ChevronRight,
  FileText,
  CalendarClock,
  Truck,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import Link from 'next/link';

interface AgingInvoice {
  id: string;
  reference: string | null;
  issuedAt: string;
  dueDate: string | null;
  daysOverdue: number;
  bucketKey: string;
  outstanding: number;
  total: number;
  status: string | null;
}

interface BucketSupplier {
  supplierId: string;
  name: string;
  nit: string | null;
  total: number;
  count: number;
  invoices: AgingInvoice[];
}

interface BucketSummary {
  key: string;
  label: string;
  lower: number | null;
  upper: number | null;
  total: number;
  count: number;
  suppliers: BucketSupplier[];
}

interface AgingResponse {
  asOf: string;
  bucketDays: number[];
  buckets: BucketSummary[];
  totalOutstanding: number;
  totalCurrent: number;
  totalOverdue: number;
}

interface SupplierRow {
  supplierId: string;
  name: string;
  nit: string | null;
  total: number;
  byBucket: Record<string, number>;
  countByBucket: Record<string, number>;
  invoices: AgingInvoice[];
  invoiceCount: number;
}

function formatQ(n: number): string {
  return `Q${Number(n || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function PayablesAgingPage() {
  const { toast } = useToast();
  const [asOf, setAsOf] = useState<string>(todayIso());
  const [aging, setAging] = useState<AgingResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadData = useCallback(
    async (date: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/payables/aging?asOf=${encodeURIComponent(date)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || 'No se pudo cargar el aging');
        }
        const data = (await res.json()) as AgingResponse;
        setAging(data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error cargando aging';
        toast({ tone: 'error', message: msg });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void loadData(asOf);
  }, [asOf, loadData]);

  const rows = useMemo<SupplierRow[]>(() => {
    if (!aging) return [];
    const bySupplier = new Map<string, SupplierRow>();

    for (const bucket of aging.buckets) {
      for (const s of bucket.suppliers) {
        let row = bySupplier.get(s.supplierId);
        if (!row) {
          row = {
            supplierId: s.supplierId,
            name: s.name,
            nit: s.nit,
            total: 0,
            byBucket: {},
            countByBucket: {},
            invoices: [],
            invoiceCount: 0,
          };
          bySupplier.set(s.supplierId, row);
        }
        row.byBucket[bucket.key] = (row.byBucket[bucket.key] ?? 0) + s.total;
        row.countByBucket[bucket.key] =
          (row.countByBucket[bucket.key] ?? 0) + s.count;
        row.total += s.total;
        row.invoices.push(...s.invoices);
        row.invoiceCount += s.count;
      }
    }

    return Array.from(bySupplier.values()).sort((a, b) => b.total - a.total);
  }, [aging]);

  const bucketDefs = useMemo(() => aging?.buckets ?? [], [aging]);
  const bucketLabels = useMemo(
    () =>
      Object.fromEntries(bucketDefs.map((b) => [b.key, b.label])) as Record<
        string,
        string
      >,
    [bucketDefs],
  );
  const totalSuppliers = rows.length;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    if (!aging) return;
    const headers = [
      'Proveedor',
      'NIT',
      ...bucketDefs.map((b) => b.label),
      'Total',
    ];
    const lines = [headers.join(',')];
    for (const r of rows) {
      const cells = [
        `"${r.name.replace(/"/g, '""')}"`,
        `"${r.nit ?? ''}"`,
        ...bucketDefs.map((b) => (r.byBucket[b.key] ?? 0).toFixed(2)),
        r.total.toFixed(2),
      ];
      lines.push(cells.join(','));
    }
    const csv = '﻿' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aging_cxp_${asOf}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: DataTableColumn<SupplierRow>[] = [
    {
      key: 'expand',
      header: '',
      mobilePriority: 'hidden',
      widthClassName: 'w-8',
      accessor: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(r.supplierId);
          }}
          aria-label={
            expanded.has(r.supplierId) ? 'Contraer documentos' : 'Expandir documentos'
          }
          aria-expanded={expanded.has(r.supplierId)}
          className="p-1 rounded hover:bg-slate-100 text-slate-500"
          disabled={r.invoices.length === 0}
        >
          {expanded.has(r.supplierId) ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      ),
      exportValue: () => '',
    },
    {
      key: 'supplier',
      header: 'Proveedor',
      mobilePriority: 'title',
      filterable: true,
      accessor: (r) => (
        <div>
          <p className="font-semibold text-slate-800">{r.name}</p>
          <p className="text-xs text-slate-500 font-mono">{r.nit ?? 'Sin NIT'}</p>
        </div>
      ),
      exportValue: (r) => r.name,
    },
    ...bucketDefs.map<DataTableColumn<SupplierRow>>((b) => ({
      key: b.key,
      header: b.label,
      cellClassName: 'text-right text-sm',
      headerClassName: 'text-right',
      mobilePriority: 'meta',
      accessor: (r) => {
        const amount = r.byBucket[b.key] ?? 0;
        if (amount <= 0) return <span className="text-slate-300">—</span>;
        const isOverdue = b.key !== 'current';
        return (
          <span className={isOverdue ? 'font-semibold text-rose-600' : 'text-slate-700'}>
            {formatQ(amount)}
          </span>
        );
      },
      exportValue: (r) => (r.byBucket[b.key] ?? 0).toFixed(2),
    })),
    {
      key: 'total',
      header: 'Total',
      cellClassName: 'text-right',
      headerClassName: 'text-right',
      mobilePriority: 'highlight',
      accessor: (r) => (
        <span className="font-bold text-rose-700">{formatQ(r.total)}</span>
      ),
      exportValue: (r) => r.total.toFixed(2),
    },
  ];

  const cardRenderer = (r: SupplierRow) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 truncate">{r.name}</p>
          <p className="text-xs text-slate-500 font-mono">{r.nit ?? 'Sin NIT'}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-500">Total</p>
          <p className="font-bold text-rose-700">{formatQ(r.total)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {bucketDefs.map((b) => {
          const amt = r.byBucket[b.key] ?? 0;
          if (amt <= 0) return null;
          const isOverdue = b.key !== 'current';
          return (
            <div
              key={b.key}
              className={`rounded-lg px-2 py-1.5 ${
                isOverdue ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              <span className="font-medium">{b.label}: </span>
              <span className="font-bold">{formatQ(amt)}</span>
            </div>
          );
        })}
      </div>
      {r.invoices.length > 0 && (
        <button
          type="button"
          onClick={() => toggleExpand(r.supplierId)}
          aria-expanded={expanded.has(r.supplierId)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition"
        >
          {expanded.has(r.supplierId) ? (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Ocultar documentos
            </>
          ) : (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              Ver {r.invoices.length} documento{r.invoices.length === 1 ? '' : 's'}
            </>
          )}
        </button>
      )}
      {expanded.has(r.supplierId) && r.invoices.length > 0 && (
        <InvoicesTable invoices={r.invoices} bucketLabels={bucketLabels} />
      )}
    </div>
  );

  const totalOutstanding = aging?.totalOutstanding ?? 0;
  const totalCurrent = aging?.totalCurrent ?? 0;
  const totalOverdue = aging?.totalOverdue ?? 0;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Contabilidad', href: '/accounting' },
          { label: 'Cuentas por Pagar', href: '/accounting/payables' },
          { label: 'Antigüedad de Saldos' },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <CreditCard className="w-6 h-6 text-rose-600" />
            Antigüedad de Saldos · CxP
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Saldos por proveedor clasificados por antigüedad al{' '}
            <span className="font-medium">
              {aging ? format(parseISO(aging.asOf), 'dd/MM/yyyy') : '...'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label
              htmlFor="asOfPayables"
              className="block text-xs font-medium text-slate-500 mb-1"
            >
              Fecha de corte
            </label>
            <div className="relative">
              <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                id="asOfPayables"
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value || todayIso())}
                aria-label="Fecha de corte"
                className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 outline-none"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadData(asOf)}
            aria-label="Recargar"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Recargar</span>
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!aging || rows.length === 0}
            aria-label="Exportar CSV"
            className="flex items-center gap-2 px-3 py-2 bg-rose-600 text-white rounded-xl text-sm font-medium hover:bg-rose-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-r from-rose-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg shadow-rose-500/20">
          <p className="text-rose-100 text-xs font-bold uppercase tracking-widest">
            Total por Pagar
          </p>
          <p className="text-2xl font-bold mt-2">{formatQ(totalOutstanding)}</p>
          <p className="text-rose-100 text-sm mt-1 flex items-center gap-1">
            <Truck className="w-3 h-3" /> {totalSuppliers} proveedor
            {totalSuppliers === 1 ? '' : 'es'} con saldo
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-sm">
          <p className="text-emerald-600 text-xs font-bold uppercase tracking-widest">
            Al día
          </p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">
            {formatQ(totalCurrent)}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-rose-100 shadow-sm">
          <p className="text-rose-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" /> Vencido
          </p>
          <p className="text-2xl font-bold text-rose-600 mt-2">
            {formatQ(totalOverdue)}
          </p>
        </div>
      </div>

      {/* Resumen por bucket */}
      {aging && aging.buckets.length > 0 && (
        <div
          className={`grid grid-cols-2 gap-3 ${
            {
              2: 'sm:grid-cols-2',
              3: 'sm:grid-cols-3',
              4: 'sm:grid-cols-4',
              5: 'sm:grid-cols-5',
              6: 'sm:grid-cols-6',
            }[Math.min(aging.buckets.length, 6)] ?? 'sm:grid-cols-5'
          }`}
        >
          {aging.buckets.map((b) => {
            const isOverdue = b.key !== 'current';
            return (
              <div
                key={b.key}
                className={`rounded-xl p-3 border ${
                  isOverdue
                    ? 'border-rose-100 bg-rose-50/40'
                    : 'border-emerald-100 bg-emerald-50/40'
                }`}
              >
                <p
                  className={`text-xs font-bold uppercase tracking-widest ${
                    isOverdue ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {b.label}
                </p>
                <p className="text-base font-bold text-slate-800 mt-1">
                  {formatQ(b.total)}
                </p>
                <p className="text-xs text-slate-500">
                  {b.count} documento{b.count === 1 ? '' : 's'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/accounting/payables"
          className="text-rose-700 hover:text-rose-800 hover:underline"
        >
          ← Volver a Cuentas por Pagar
        </Link>
      </div>

      {rows.length === 0 && !loading ? (
        <EmptyState
          icon={<CreditCard className="w-7 h-7" />}
          title="Sin saldos pendientes"
          description="Ningún proveedor tiene saldo abierto a la fecha de corte seleccionada."
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          getRowId={(r) => r.supplierId}
          onRowClick={(r) => toggleExpand(r.supplierId)}
          emptyMessage="No hay proveedores con saldo pendiente."
          cardRenderer={cardRenderer}
        />
      )}

      {/* Drill-down panel (desktop) */}
      <div className="hidden md:block space-y-3">
        {rows
          .filter((r) => expanded.has(r.supplierId) && r.invoices.length > 0)
          .map((r) => (
            <div
              key={`exp-${r.supplierId}`}
              className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    Documentos de {r.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.invoices.length} documento{r.invoices.length === 1 ? '' : 's'} · {formatQ(r.total)} total
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleExpand(r.supplierId)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                  aria-label="Ocultar documentos"
                >
                  Ocultar
                </button>
              </div>
              <InvoicesTable invoices={r.invoices} bucketLabels={bucketLabels} />
            </div>
          ))}
      </div>
    </div>
  );
}

function InvoicesTable({
  invoices,
  bucketLabels,
}: {
  invoices: AgingInvoice[];
  bucketLabels: Record<string, string>;
}) {
  const sorted = useMemo(
    () =>
      [...invoices].sort((a, b) => {
        if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
        const ad = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
        const bd = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
        return ad - bd;
      }),
    [invoices],
  );
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="text-slate-500 border-b border-slate-200">
          <tr>
            <th className="text-left py-2 px-2 font-medium">Referencia</th>
            <th className="text-left py-2 px-2 font-medium">Emisión</th>
            <th className="text-left py-2 px-2 font-medium">Vencimiento</th>
            <th className="text-right py-2 px-2 font-medium">Días</th>
            <th className="text-left py-2 px-2 font-medium">Bucket</th>
            <th className="text-right py-2 px-2 font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((inv) => (
            <tr
              key={inv.id}
              className="border-b border-slate-100 last:border-0 hover:bg-white transition"
            >
              <td className="py-2 px-2 font-mono text-slate-700">
                {inv.reference ?? inv.id.slice(0, 8)}
              </td>
              <td className="py-2 px-2 text-slate-600">
                {format(parseISO(inv.issuedAt), 'dd/MM/yyyy')}
              </td>
              <td className="py-2 px-2 text-slate-600">
                {inv.dueDate ? format(parseISO(inv.dueDate), 'dd/MM/yyyy') : '—'}
              </td>
              <td className="py-2 px-2 text-right">
                {inv.daysOverdue > 0 ? (
                  <span className="font-bold text-rose-600">{inv.daysOverdue}d</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="py-2 px-2">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    inv.bucketKey === 'current'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {bucketLabels[inv.bucketKey] ?? inv.bucketKey}
                </span>
              </td>
              <td className="py-2 px-2 text-right font-bold text-slate-800">
                {`Q${Number(inv.outstanding).toLocaleString('es-GT', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
