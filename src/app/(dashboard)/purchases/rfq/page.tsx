'use client';

/**
 * Fase 22c-4 · Listado de RFQs migrado a DataTable + useDataTable.
 *
 * - Filtros: status (multi), createdById, buyerId, fechas.
 * - Paginación servidor.
 * - cardRenderer mobile.
 * - Click en fila → /purchases/rfq/[id].
 */

import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollText, Plus } from 'lucide-react';
import { useDataTable } from '@/hooks/useDataTable';
import {
  DataTable,
  type DataTableColumn,
  type DataTableFilterDef,
} from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { RfqStatusBadge } from '@/components/purchases/RfqStatusBadge';

interface RfqRow {
  id: string;
  reference: string | null;
  reason: string;
  status: string;
  createdAt: string;
  responseDeadline: string | null;
  branch: { id: string; name: string } | null;
  buyer: { id: string; name: string | null } | null;
  createdBy: { id: string; name: string | null } | null;
  _count: { items: number; invitations: number; quotes: number };
  awardedQuote: {
    id: string;
    totalAmount: number | string;
    supplier: { id: string; name: string };
  } | null;
}

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'SENT', label: 'Enviado' },
  { value: 'AWARDED', label: 'Adjudicado' },
  { value: 'CANCELLED', label: 'Cancelado' },
  { value: 'CLOSED', label: 'Cerrado' },
];

export default function RfqListPage() {
  const router = useRouter();

  const table = useDataTable<RfqRow>({
    defaultLimit: 20,
    onFetch: async ({ page, limit, filters, signal }) => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(limit));
      const statusFilter = filters.status;
      if (typeof statusFilter === 'string' && statusFilter) {
        params.set('status', statusFilter);
      }
      if (typeof filters.dateFrom === 'string' && filters.dateFrom) {
        params.set('dateFrom', filters.dateFrom);
      }
      if (typeof filters.dateTo === 'string' && filters.dateTo) {
        params.set('dateTo', filters.dateTo);
      }
      if (typeof filters.buyerId === 'string' && filters.buyerId) {
        params.set('buyerId', filters.buyerId);
      }
      const res = await fetch(`/api/purchases/rfq?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('Error al cargar RFQs.');
      const json = await res.json();
      return { data: json.data ?? [], total: json.total ?? 0 };
    },
  });

  const externalFilters: DataTableFilterDef[] = [
    {
      key: 'status',
      label: 'Estado',
      type: 'select',
      options: [{ value: '', label: 'Todos' }, ...STATUS_OPTIONS],
      value: (table.filters.status as string) || '',
      onChange: (v) => {
        table.setFilter('status', v ? String(v) : '');
      },
    },
    {
      key: 'dateFrom',
      label: 'Desde',
      type: 'date',
      value: (table.filters.dateFrom as string) || '',
      onChange: (v) => table.setFilter('dateFrom', v ? String(v) : ''),
    },
    {
      key: 'dateTo',
      label: 'Hasta',
      type: 'date',
      value: (table.filters.dateTo as string) || '',
      onChange: (v) => table.setFilter('dateTo', v ? String(v) : ''),
    },
  ];

  const columns: DataTableColumn<RfqRow>[] = [
    {
      key: 'reference',
      header: 'Referencia',
      mobilePriority: 'title',
      accessor: (r) => (
        <div>
          <p className="font-bold text-slate-800">
            {r.reference || `Borrador #${r.id.slice(0, 6).toUpperCase()}`}
          </p>
          <p className="text-[10px] text-slate-500">
            {r.branch?.name ?? 'Sin sucursal'}
          </p>
        </div>
      ),
      exportValue: (r) => r.reference || r.id,
    },
    {
      key: 'reason',
      header: 'Motivo',
      mobilePriority: 'meta',
      accessor: (r) => (
        <span className="text-slate-600 line-clamp-2">{r.reason}</span>
      ),
      exportValue: (r) => r.reason,
    },
    {
      key: 'buyer',
      header: 'Comprador',
      mobilePriority: 'hidden',
      accessor: (r) => (
        <span className="text-slate-500 text-xs">
          {r.buyer?.name || r.createdBy?.name || '-'}
        </span>
      ),
      exportValue: (r) => r.buyer?.name || r.createdBy?.name || '',
    },
    {
      key: 'status',
      header: 'Estado',
      mobilePriority: 'highlight',
      accessor: (r) => <RfqStatusBadge status={r.status} />,
      exportValue: (r) => r.status,
    },
    {
      key: 'items',
      header: 'Items',
      mobilePriority: 'meta',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (r) => <span className="font-bold">{r._count.items}</span>,
      exportValue: (r) => String(r._count.items),
    },
    {
      key: 'invitations',
      header: 'Invitados',
      mobilePriority: 'meta',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (r) => <span className="text-slate-600">{r._count.invitations}</span>,
      exportValue: (r) => String(r._count.invitations),
    },
    {
      key: 'quotes',
      header: 'Cotizaciones',
      mobilePriority: 'meta',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (r) => <span className="text-slate-600">{r._count.quotes}</span>,
      exportValue: (r) => String(r._count.quotes),
    },
    {
      key: 'responseDeadline',
      header: 'Fecha límite',
      mobilePriority: 'hidden',
      accessor: (r) =>
        r.responseDeadline ? (
          <span className="text-xs font-mono text-slate-500">
            {format(new Date(r.responseDeadline), 'dd/MM/yyyy')}
          </span>
        ) : (
          <span className="text-slate-700">-</span>
        ),
      exportValue: (r) =>
        r.responseDeadline ? format(new Date(r.responseDeadline), 'dd/MM/yyyy') : '',
    },
    {
      key: 'createdAt',
      header: 'Creación',
      mobilePriority: 'meta',
      accessor: (r) => (
        <span className="text-xs font-mono text-slate-500">
          {format(new Date(r.createdAt), "dd MMM yy", { locale: es })}
        </span>
      ),
      exportValue: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy'),
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Compras', href: '/purchases' },
          { label: 'RFQ' },
        ]}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <ScrollText className="w-6 h-6 text-blue-600" /> Cotizaciones (RFQ)
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">
            Solicita cotización a varios proveedores y adjudica al mejor.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/purchases/rfq/new')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Nueva RFQ
        </button>
      </div>

      <DataTable
        columns={columns}
        data={table.data}
        total={table.pagination.total}
        page={table.pagination.page}
        pageSize={table.pagination.limit}
        onPageChange={table.pagination.onPageChange}
        onPageSizeChange={table.pagination.onLimitChange}
        loading={table.loading}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/purchases/rfq/${r.id}`)}
        filters={externalFilters}
        enableCsvExport
        enablePdfExport
        exportFileName="rfqs"
        empty={
          <EmptyState
            icon={<ScrollText className="w-7 h-7" />}
            title="No hay RFQs todavía"
            description="Creá una RFQ para comparar precios entre proveedores."
          />
        }
        cardRenderer={(r) => (
          <div className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-800">
                  {r.reference || `Borrador #${r.id.slice(0, 6).toUpperCase()}`}
                </p>
                <p className="text-xs text-slate-500 line-clamp-2">{r.reason}</p>
              </div>
              <RfqStatusBadge status={r.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>{r._count.items} items</span>
              <span>·</span>
              <span>{r._count.invitations} invit.</span>
              <span>·</span>
              <span>{r._count.quotes} cotiz.</span>
            </div>
            <p className="text-[10px] text-slate-500 font-mono">
              {format(new Date(r.createdAt), 'dd/MM/yyyy', { locale: es })}
              {r.branch && ` · ${r.branch.name}`}
            </p>
          </div>
        )}
      />
    </div>
  );
}
