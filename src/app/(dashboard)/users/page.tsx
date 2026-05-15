'use client';

/**
 * Fase 22b · Users con DataTable + useDataTable.
 *
 * El endpoint `/api/users` devuelve el array completo (sin paginación servidor
 * ni búsqueda). Se aplica paginación + búsqueda client-side.
 *
 * TODO Fase 24: agregar paginación servidor a /api/users (params page, limit, q).
 */

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { UserPlus, Edit2, Shield, ShieldOff, CheckCircle, Key, Users } from 'lucide-react';
import { UserModal } from '@/components/users/UserModal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  customRole?: { name: string } | null;
  active: boolean;
  createdAt: string;
  branch?: { id: string; name: string } | null;
  branchAccess?: { branch: { id: string; name: string } }[];
}

export default function UsersPage() {
  const { data: session } = useSession();
  const canManageUsers =
    session?.user?.role === 'SUPER_ADMIN' ||
    session?.user?.permissions?.includes('users:manage') ||
    session?.user?.permissions?.includes('settings:manage');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const table = useDataTable<UserData>({
    defaultLimit: 25,
    autoLoad: Boolean(canManageUsers),
    onFetch: async ({ page, limit, search, signal }) => {
      const res = await fetch('/api/users', { signal });
      if (!res.ok) throw new Error('Error al cargar usuarios.');
      const json = await res.json();
      const all: UserData[] = Array.isArray(json) ? json : [];
      const term = search.trim().toLowerCase();
      const filtered = term
        ? all.filter(
            (u) =>
              u.name.toLowerCase().includes(term) ||
              u.email.toLowerCase().includes(term),
          )
        : all;
      const start = (page - 1) * limit;
      return { data: filtered.slice(start, start + limit), total: filtered.length };
    },
  });

  if (!canManageUsers) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 bg-red-50 text-red-600 rounded-3xl m-8">
        <ShieldOff className="w-16 h-16 mb-4 opacity-50" />
        <h2 className="font-bold text-2xl mb-2">Acceso Restringido</h2>
        <p>Solo los Administradores pueden gestionar el personal del sistema.</p>
      </div>
    );
  }

  const columns: DataTableColumn<UserData>[] = [
    {
      key: 'identity',
      header: 'Identidad',
      mobilePriority: 'title',
      accessor: (u) => (
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-600">
            {u.name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-bold text-slate-900">{u.name}</span>
        </div>
      ),
      exportValue: (u) => u.name,
    },
    {
      key: 'email',
      header: 'Correo',
      mobilePriority: 'meta',
      accessor: (u) => <span className="text-slate-500 font-medium">{u.email}</span>,
      exportValue: (u) => u.email,
    },
    {
      key: 'role',
      header: 'Nivel de acceso',
      mobilePriority: 'meta',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (u) => (
        <span
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-widest uppercase border ${
            u.role === 'SUPER_ADMIN'
              ? 'bg-purple-50 text-purple-600 border-purple-100'
              : u.customRole?.name === 'Administrador' || u.customRole?.name === 'Admin'
                ? 'bg-blue-50 text-blue-600 border-blue-100'
                : 'bg-slate-50 text-slate-500 border-slate-100'
          }`}
        >
          {u.customRole?.name || u.role}
        </span>
      ),
      exportValue: (u) => u.customRole?.name || u.role,
    },
    {
      key: 'branch',
      header: 'Sucursal base',
      mobilePriority: 'meta',
      accessor: (u) => (
        u.branch?.name ? (
          <span className="font-bold text-slate-800">{u.branch.name}</span>
        ) : (
          <span className="text-slate-400 italic">Sin asignar</span>
        )
      ),
      exportValue: (u) => u.branch?.name || '',
    },
    {
      key: 'active',
      header: 'Estatus',
      mobilePriority: 'highlight',
      accessor: (u) =>
        u.active ? (
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-widest border border-emerald-100">
            <CheckCircle className="w-3 h-3" /> Activo
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-500 text-[10px] font-bold uppercase tracking-widest border border-rose-100 opacity-70">
            Suspendido
          </span>
        ),
      exportValue: (u) => (u.active ? 'Activo' : 'Suspendido'),
    },
    {
      key: 'createdAt',
      header: 'Fecha de ingreso',
      mobilePriority: 'hidden',
      accessor: (u) => (
        <span className="text-slate-400 font-mono text-xs">
          {format(new Date(u.createdAt), 'dd/MM/yyyy', { locale: es })}
        </span>
      ),
      exportValue: (u) => format(new Date(u.createdAt), 'dd/MM/yyyy'),
    },
    {
      key: 'actions',
      header: 'Opciones',
      mobilePriority: 'hidden',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (u) => (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { setSelectedUser(u); setIsModalOpen(true); }}
            className="p-2 bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white rounded-xl transition-all"
            aria-label="Editar usuario"
            title="Editar"
          >
            <Edit2 className="w-4 h-4" />
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
          { label: 'Usuarios' },
        ]}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-600" />
            Equipo y Permisos
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">
            Gestión administrativa de roles y acceso a sucursales
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/users/roles"
            className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm flex items-center gap-2 transition-all"
          >
            <Key className="w-4 h-4 text-blue-500" /> Gestionar Roles
          </a>
          <button
            onClick={() => { setSelectedUser(null); setIsModalOpen(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-blue-500/10 flex items-center gap-2 transition-all"
          >
            <UserPlus className="w-4 h-4" /> Nuevo Integrante
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
        getRowId={(u) => u.id}
        search={{
          value: table.search.value,
          onChange: table.search.onChange,
          placeholder: 'Buscar por nombre o correo...',
        }}
        empty={
          <EmptyState
            icon={<Users className="w-7 h-7" />}
            title="Sin integrantes"
            description="Aún no se han registrado usuarios para este negocio."
            action={
              <button
                onClick={() => { setSelectedUser(null); setIsModalOpen(true); }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium inline-flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> Nuevo Integrante
              </button>
            }
          />
        }
      />

      {isModalOpen && (
        <UserModal
          user={selectedUser}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => { setIsModalOpen(false); void table.refetch(); }}
        />
      )}
    </div>
  );
}
