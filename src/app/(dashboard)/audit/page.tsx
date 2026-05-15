'use client';

/**
 * Fase 22b · Audit log con DataTable + useDataTable.
 *
 * Endpoint /api/audit ya soporta paginación servidor
 * (page, limit, action, entity). Mapeamos directo al hook y exponemos los
 * filtros como filters externos del DataTable.
 */

import { Activity } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  changes: unknown;
  createdAt: string;
  user?: { name: string; email: string } | null;
  branch?: { name: string } | null;
}

const ACTIONS = [
  'SALE_CREATED', 'SALE_VOIDED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED',
  'PRODUCT_DELETED', 'STOCK_TRANSFER', 'USER_CREATED', 'USER_UPDATED',
  'BRANCH_CREATED', 'BRANCH_UPDATED', 'SETTINGS_UPDATED',
  'CASH_REGISTER_OPENED', 'CASH_REGISTER_CLOSED',
];

const ENTITIES = [
  'Sale', 'Product', 'ProductStock', 'User', 'Branch', 'CompanySettings', 'CashRegister',
];

function renderChanges(changes: unknown): React.ReactNode {
  if (!changes) return <span className="text-slate-400">-</span>;
  let parsed = changes;
  if (typeof changes === 'string') {
    try {
      parsed = JSON.parse(changes);
    } catch {
      return <span className="text-xs text-slate-500">{changes}</span>;
    }
  }
  return (
    <pre className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded max-w-xs overflow-auto">
      {JSON.stringify(parsed, null, 2)}
    </pre>
  );
}

export default function AuditPage() {
  const table = useDataTable<AuditLog>({
    defaultLimit: 50,
    onFetch: async ({ page, limit, filters, signal }) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (filters.action) params.set('action', String(filters.action));
      if (filters.entity) params.set('entity', String(filters.entity));
      const res = await fetch(`/api/audit?${params}`, { signal });
      if (!res.ok) throw new Error('Error al cargar bitácora.');
      const json = await res.json();
      return { data: json.logs ?? [], total: json.total ?? 0 };
    },
  });

  const columns: DataTableColumn<AuditLog>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      mobilePriority: 'meta',
      accessor: (log) => (
        <span className="text-slate-500">
          {format(new Date(log.createdAt), "dd MMM, HH:mm", { locale: es })}
        </span>
      ),
      exportValue: (log) => format(new Date(log.createdAt), 'dd/MM/yyyy HH:mm'),
    },
    {
      key: 'action',
      header: 'Acción',
      mobilePriority: 'title',
      accessor: (log) => <span className="font-bold text-slate-700">{log.action}</span>,
      exportValue: (log) => log.action,
    },
    {
      key: 'entity',
      header: 'Entidad / ID',
      mobilePriority: 'meta',
      accessor: (log) => (
        <div>
          <div className="text-slate-800">{log.entity}</div>
          <div className="text-xs text-slate-600 font-mono mt-1">{log.entityId.substring(0, 8)}...</div>
        </div>
      ),
      exportValue: (log) => `${log.entity} (${log.entityId})`,
    },
    {
      key: 'user',
      header: 'Usuario',
      mobilePriority: 'highlight',
      accessor: (log) => (
        <div>
          <div className="font-medium text-slate-800">{log.user?.name || 'Sistema'}</div>
          <div className="text-xs text-slate-500">{log.user?.email || ''}</div>
        </div>
      ),
      exportValue: (log) => log.user?.name || 'Sistema',
    },
    {
      key: 'changes',
      header: 'Detalles',
      mobilePriority: 'hidden',
      accessor: (log) => renderChanges(log.changes),
      exportValue: (log) => {
        if (!log.changes) return '';
        return typeof log.changes === 'string' ? log.changes : JSON.stringify(log.changes);
      },
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Auditoría' },
        ]}
      />
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Activity className="w-6 h-6 text-indigo-600" />
          Registro de Auditoría
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Monitorea la actividad del sistema y los eventos operativos importantes.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={table.data}
        loading={table.loading}
        total={table.pagination.total}
        page={table.pagination.page}
        pageSize={table.pagination.limit}
        onPageChange={table.pagination.onPageChange}
        onPageSizeChange={table.pagination.onLimitChange}
        getRowId={(log) => log.id}
        filters={[
          {
            key: 'action',
            label: 'Acción',
            type: 'select',
            options: ACTIONS.map((a) => ({ value: a, label: a })),
            value: (table.filters.action as string) ?? '',
            onChange: (v) => table.setFilter('action', v ?? ''),
          },
          {
            key: 'entity',
            label: 'Entidad',
            type: 'select',
            options: ENTITIES.map((e) => ({ value: e, label: e })),
            value: (table.filters.entity as string) ?? '',
            onChange: (v) => table.setFilter('entity', v ?? ''),
          },
        ]}
        empty={
          <EmptyState
            icon={<Activity className="w-7 h-7" />}
            title="Sin registros de auditoría"
            description="No hay eventos que coincidan con los filtros aplicados."
          />
        }
      />
    </div>
  );
}
