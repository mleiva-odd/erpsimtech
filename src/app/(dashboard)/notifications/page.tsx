'use client';

/**
 * Fase 22b · Notifications con DataTable + useDataTable.
 *
 * Endpoint `/api/notifications` devuelve un array (sin paginación servidor,
 * solo soporta `take`). Paginación + filtros client-side. Soporta bulkActions
 * "Marcar como leídas" sobre la selección.
 *
 * TODO Fase 24: agregar paginación servidor a /api/notifications.
 */

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { AlertCircle, AlertTriangle, Bell, Info, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/components/ui/toast';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ERROR';
  isRead: boolean;
  createdAt: string;
}

function iconFor(type: NotificationItem['type']) {
  switch (type) {
    case 'ERROR':
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    case 'WARNING':
      return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    default:
      return <Info className="w-5 h-5 text-blue-500" />;
  }
}

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const { toast } = useToast();

  const hasCompanyContext = Boolean(session?.user?.companyId);
  const canAccess = hasCompanyContext && session?.user?.role !== 'SUPER_ADMIN';

  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const table = useDataTable<NotificationItem>({
    defaultLimit: 25,
    autoLoad: canAccess,
    onFetch: async ({ page, limit, signal }) => {
      const params = new URLSearchParams({ take: '200' });
      if (showUnreadOnly) params.set('unreadOnly', 'true');
      const res = await fetch(`/api/notifications?${params}`, { signal });
      if (!res.ok) throw new Error('Error al cargar notificaciones.');
      const json = await res.json();
      const all: NotificationItem[] = Array.isArray(json) ? json : [];
      const start = (page - 1) * limit;
      return { data: all.slice(start, start + limit), total: all.length };
    },
  });

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast({ tone: 'success', message: 'Notificaciones marcadas como leídas.' });
        void table.refetch();
      }
    } catch {
      toast({ tone: 'error', message: 'Error al marcar como leídas.' });
    }
  };

  const markOneAsRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      void table.refetch();
    } catch {
      // silencioso
    }
  };

  const markManyAsRead = async (rows: NotificationItem[]) => {
    try {
      await Promise.all(
        rows
          .filter((r) => !r.isRead)
          .map((r) =>
            fetch('/api/notifications', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: r.id }),
            }),
          ),
      );
      toast({ tone: 'success', message: `${rows.length} notificación(es) marcadas como leídas.` });
      void table.refetch();
    } catch {
      toast({ tone: 'error', message: 'Error al marcar la selección.' });
    }
  };

  if (!canAccess && status !== 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="rounded-3xl border border-rose-100 bg-rose-50 px-8 py-10 text-center">
          <h2 className="text-xl font-bold text-rose-700">Acceso denegado</h2>
          <p className="mt-2 text-sm text-rose-600">
            Las notificaciones operativas solo están disponibles dentro de una empresa activa.
          </p>
        </div>
      </div>
    );
  }

  const columns: DataTableColumn<NotificationItem>[] = [
    {
      key: 'type',
      header: 'Tipo',
      mobilePriority: 'meta',
      accessor: (n) => iconFor(n.type),
      exportValue: (n) => n.type,
    },
    {
      key: 'title',
      header: 'Notificación',
      mobilePriority: 'title',
      accessor: (n) => (
        <div>
          <p className={`text-sm ${n.isRead ? 'font-semibold text-slate-700' : 'font-bold text-slate-900'}`}>
            {n.title}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
        </div>
      ),
      exportValue: (n) => `${n.title} — ${n.message}`,
    },
    {
      key: 'createdAt',
      header: 'Hace',
      mobilePriority: 'highlight',
      accessor: (n) => (
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: es })}
        </span>
      ),
      exportValue: (n) => new Date(n.createdAt).toISOString(),
    },
    {
      key: 'isRead',
      header: 'Estado',
      mobilePriority: 'meta',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (n) =>
        n.isRead ? (
          <span className="text-[10px] font-bold text-slate-400">Leída</span>
        ) : (
          <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1 justify-center">
            <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" /> Nueva
          </span>
        ),
      exportValue: (n) => (n.isRead ? 'Leída' : 'Nueva'),
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Notificaciones' },
        ]}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Bell className="w-6 h-6 text-blue-600" />
            Centro de Notificaciones
          </h1>
          <p className="text-sm text-slate-500">Historial de alertas operativas y eventos recientes.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => { setShowUnreadOnly(false); void table.refetch(); }}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              !showUnreadOnly ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            Todas
          </button>
          <button
            onClick={() => { setShowUnreadOnly(true); void table.refetch(); }}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              showUnreadOnly ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            No leídas
          </button>
          <button
            onClick={() => void markAllAsRead()}
            className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 flex items-center gap-2"
          >
            <CheckCheck className="w-4 h-4" /> Marcar todas
          </button>
        </div>
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
        getRowId={(n) => n.id}
        onRowClick={(n) => { if (!n.isRead) void markOneAsRead(n.id); }}
        bulkActions={[
          {
            label: 'Marcar como leídas',
            variant: 'primary',
            onClick: async (rows) => markManyAsRead(rows),
          },
        ]}
        empty={
          <EmptyState
            icon={<Bell className="w-7 h-7" />}
            title="Sin notificaciones"
            description={showUnreadOnly ? 'No hay notificaciones sin leer.' : 'No hay notificaciones para mostrar.'}
          />
        }
      />
    </div>
  );
}
