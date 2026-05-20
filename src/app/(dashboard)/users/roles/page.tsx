'use client';

/**
 * Fase 22b · Roles con DataTable + useDataTable (cardRenderer para mobile y desktop).
 *
 * El endpoint `/api/settings/roles` devuelve el array completo (sin paginación
 * servidor ni búsqueda). Paginación + búsqueda client-side.
 *
 * Reemplaza `confirm()`/`alert()` nativos por `useConfirm` + `useToast`.
 *
 * TODO Fase 24: agregar paginación servidor a /api/settings/roles si crece la lista.
 */

import { useState } from 'react';
import { Shield, Plus, Edit2, Trash2, Key, Users } from 'lucide-react';
import { RoleModal } from '@/components/users/RoleModal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  _count?: { users: number };
}

export default function RolesPage() {
  const [selectedRole, setSelectedRole] = useState<CustomRole | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const table = useDataTable<CustomRole>({
    defaultLimit: 25,
    onFetch: async ({ page, limit, search, signal }) => {
      const res = await fetch('/api/settings/roles', { signal });
      if (!res.ok) throw new Error('Error al cargar roles.');
      const json = await res.json();
      const all: CustomRole[] = Array.isArray(json) ? json : [];
      const term = search.trim().toLowerCase();
      const filtered = term
        ? all.filter((r) => r.name.toLowerCase().includes(term))
        : all;
      const start = (page - 1) * limit;
      return { data: filtered.slice(start, start + limit), total: filtered.length };
    },
  });

  const handleDelete = async (role: CustomRole) => {
    const accepted = await confirm({
      title: 'Eliminar rol',
      message: `¿Eliminar el rol "${role.name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      tone: 'danger',
    });
    if (!accepted) return;
    try {
      const res = await fetch(`/api/settings/roles/${role.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast({ tone: 'error', message: data.error || 'Error al eliminar el rol.' });
      } else {
        toast({ tone: 'success', message: 'Rol eliminado correctamente.' });
        void table.refetch();
      }
    } catch {
      toast({ tone: 'error', message: 'Error de conexión al eliminar.' });
    }
  };

  const columns: DataTableColumn<CustomRole>[] = [
    {
      key: 'name',
      header: 'Rol',
      mobilePriority: 'title',
      accessor: (r) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-slate-900">{r.name}</p>
            <p className="text-xs text-slate-500 line-clamp-1">{r.description || 'Sin descripción'}</p>
          </div>
        </div>
      ),
      exportValue: (r) => r.name,
    },
    {
      key: 'users',
      header: 'Usuarios',
      mobilePriority: 'meta',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (r) => (
        <span className="inline-flex items-center gap-1.5 text-slate-600 text-xs font-bold">
          <Users className="w-3.5 h-3.5" /> {r._count?.users || 0}
        </span>
      ),
      exportValue: (r) => String(r._count?.users ?? 0),
    },
    {
      key: 'permissions',
      header: 'Permisos',
      mobilePriority: 'highlight',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (r) => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-widest">
          {r.permissions.length} permisos
        </span>
      ),
      exportValue: (r) => String(r.permissions.length),
    },
    {
      key: 'actions',
      header: 'Acciones',
      mobilePriority: 'hidden',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (r) => (
        <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { setSelectedRole(r); setIsModalOpen(true); }}
            aria-label="Editar rol"
            title="Editar"
            className="p-2 hover:bg-slate-50 text-slate-500 hover:text-blue-600 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => void handleDelete(r)}
            aria-label="Eliminar rol"
            title="Eliminar"
            className="p-2 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
      exportValue: () => '',
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Usuarios', href: '/users' },
          { label: 'Roles' },
        ]}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Key className="w-6 h-6 text-blue-600" />
            Roles y Privilegios
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">
            Define quién puede hacer qué dentro de tu plataforma
          </p>
        </div>
        <button
          onClick={() => { setSelectedRole(null); setIsModalOpen(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-slate-500/10 flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" /> Nuevo Rol
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
        getRowId={(r) => r.id}
        search={{
          value: table.search.value,
          onChange: table.search.onChange,
          placeholder: 'Buscar rol...',
        }}
        empty={
          <EmptyState
            icon={<Shield className="w-7 h-7" />}
            title="Sin roles personalizados"
            description="Crea un rol nuevo para empezar a asignar permisos por equipo."
            action={
              <button
                onClick={() => { setSelectedRole(null); setIsModalOpen(true); }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Nuevo Rol
              </button>
            }
          />
        }
      />

      {isModalOpen && (
        <RoleModal
          role={selectedRole}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => { setIsModalOpen(false); void table.refetch(); }}
        />
      )}
    </div>
  );
}
