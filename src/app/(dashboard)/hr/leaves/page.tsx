'use client';

/**
 * Fase 22b · Leaves con DataTable + useDataTable.
 *
 * Endpoint `/api/hr/leaves` devuelve array completo (sin paginación servidor).
 * Paginación + búsqueda + filtro de estado client-side. Renderer mobile
 * conserva la vista card original.
 *
 * TODO Fase 24: agregar paginación servidor a /api/hr/leaves.
 */

import { useState } from 'react';
import { Palmtree, Plus, Info } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LeaveModal } from '@/components/hr/LeaveModal';
import { useToast } from '@/components/ui/toast';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface LeaveRecord {
  id: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  employee: {
    firstName: string;
    lastName: string;
  };
}

const TYPE_LABEL: Record<string, string> = {
  VACATION: 'Vacaciones',
  SICK_LEAVE: 'Permiso médico',
  PERSONAL_DAYS: 'Días personales',
  OTHER: 'Otro',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

const STATUS_BADGE: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-600',
  REJECTED: 'bg-rose-50 text-rose-600',
  PENDING: 'bg-amber-50 text-amber-600',
};

export default function LeavesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();

  const table = useDataTable<LeaveRecord>({
    defaultLimit: 25,
    onFetch: async ({ page, limit, search, filters, signal }) => {
      const res = await fetch('/api/hr/leaves', { signal });
      if (!res.ok) throw new Error('Error al cargar permisos.');
      const json = await res.json();
      const all: LeaveRecord[] = Array.isArray(json) ? json : [];
      const term = search.trim().toLowerCase();
      let filtered = term
        ? all.filter(
            (l) =>
              `${l.employee.firstName} ${l.employee.lastName}`.toLowerCase().includes(term),
          )
        : all;
      if (filters.status) {
        filtered = filtered.filter((l) => l.status === filters.status);
      }
      const start = (page - 1) * limit;
      return { data: filtered.slice(start, start + limit), total: filtered.length };
    },
  });

  const columns: DataTableColumn<LeaveRecord>[] = [
    {
      key: 'employee',
      header: 'Colaborador',
      mobilePriority: 'title',
      accessor: (l) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 font-bold text-xs">
            {l.employee.firstName.charAt(0)}{l.employee.lastName.charAt(0)}
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm">{l.employee.firstName} {l.employee.lastName}</p>
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
              {TYPE_LABEL[l.type] || l.type}
            </span>
          </div>
        </div>
      ),
      exportValue: (l) => `${l.employee.firstName} ${l.employee.lastName}`,
    },
    {
      key: 'period',
      header: 'Período',
      mobilePriority: 'meta',
      accessor: (l) => (
        <div className="text-xs text-slate-600">
          <div>Desde: <strong>{format(new Date(l.startDate), 'dd/MM/yyyy', { locale: es })}</strong></div>
          <div>Hasta: <strong>{format(new Date(l.endDate), 'dd/MM/yyyy', { locale: es })}</strong></div>
        </div>
      ),
      exportValue: (l) =>
        `${format(new Date(l.startDate), 'dd/MM/yyyy')} - ${format(new Date(l.endDate), 'dd/MM/yyyy')}`,
    },
    {
      key: 'status',
      header: 'Estado',
      mobilePriority: 'highlight',
      accessor: (l) => (
        <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${STATUS_BADGE[l.status] || ''}`}>
          {STATUS_LABEL[l.status] || l.status}
        </span>
      ),
      exportValue: (l) => STATUS_LABEL[l.status] || l.status,
    },
    {
      key: 'reason',
      header: 'Motivo',
      mobilePriority: 'meta',
      accessor: (l) => (
        <p className="text-xs text-slate-500 italic line-clamp-2 max-w-xs">
          {l.reason ? `"${l.reason}"` : 'Sin motivo'}
        </p>
      ),
      exportValue: (l) => l.reason || '',
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'RRHH', href: '/hr/employees' },
          { label: 'Permisos' },
        ]}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Palmtree className="w-6 h-6 text-emerald-600" />
            Vacaciones y Permisos
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">
            Gestión de ausencias, descansos y justificaciones médicas
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-emerald-500/10 flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" /> Solicitar Permiso
        </button>
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
        getRowId={(l) => l.id}
        search={{
          value: table.search.value,
          onChange: table.search.onChange,
          placeholder: 'Buscar colaborador...',
        }}
        filters={[
          {
            key: 'status',
            label: 'Estado',
            type: 'select',
            options: [
              { value: 'PENDING', label: 'Pendiente' },
              { value: 'APPROVED', label: 'Aprobado' },
              { value: 'REJECTED', label: 'Rechazado' },
            ],
            value: (table.filters.status as string) ?? '',
            onChange: (v) => table.setFilter('status', v ?? ''),
          },
        ]}
        cardRenderer={(l) => (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 font-bold text-sm">
                  {l.employee.firstName.charAt(0)}{l.employee.lastName.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-sm">{l.employee.firstName} {l.employee.lastName}</p>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                    {TYPE_LABEL[l.type] || l.type}
                  </span>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${STATUS_BADGE[l.status] || ''}`}>
                {STATUS_LABEL[l.status] || l.status}
              </span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl text-xs text-slate-700">
              <div className="flex-1">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Desde</p>
                <p className="font-bold">{format(new Date(l.startDate), 'dd MMM yyyy', { locale: es })}</p>
              </div>
              <div className="flex-1 text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Hasta</p>
                <p className="font-bold">{format(new Date(l.endDate), 'dd MMM yyyy', { locale: es })}</p>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                <Info className="w-3 h-3" /> Motivo
              </p>
              <p className="text-xs text-slate-500 italic line-clamp-2">
                {l.reason ? `"${l.reason}"` : 'No se proporcionó motivo.'}
              </p>
            </div>
          </div>
        )}
        empty={
          <EmptyState
            icon={<Palmtree className="w-7 h-7" />}
            title="Sin solicitudes"
            description="No hay vacaciones ni permisos registrados todavía."
            action={
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Solicitar Permiso
              </button>
            }
          />
        }
      />

      {isModalOpen && (
        <LeaveModal
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            void table.refetch();
            toast({ tone: 'success', message: 'Solicitud registrada correctamente.' });
          }}
        />
      )}
    </div>
  );
}
