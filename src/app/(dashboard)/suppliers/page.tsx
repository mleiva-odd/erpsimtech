'use client';

/**
 * Fase 22b · Suppliers con DataTable + useDataTable.
 *
 * El endpoint `/api/suppliers` devuelve el listado completo (`{ suppliers }`),
 * sin paginación servidor ni búsqueda. Paginamos y filtramos client-side
 * dentro de `onFetch` recortando el array completo (limit/skip + match local).
 *
 * TODO Fase 24: agregar paginación servidor a /api/suppliers
 * (params page, limit, q) y eliminar el slice client-side.
 */

import { useState } from 'react';
import { Truck, Plus, Edit2, Trash2, Loader2, X, Save } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  nit: string | null;
  address: string | null;
}

export default function SuppliersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [formData, setFormData] = useState({
    name: '', contactName: '', email: '', phone: '', nit: '', address: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const table = useDataTable<Supplier>({
    defaultLimit: 25,
    onFetch: async ({ page, limit, search, signal }) => {
      const res = await fetch('/api/suppliers', { signal });
      if (!res.ok) throw new Error('Error al cargar proveedores.');
      const json = await res.json();
      const all: Supplier[] = json.suppliers ?? [];
      const term = search.trim().toLowerCase();
      const filtered = term
        ? all.filter(
            (s) =>
              s.name.toLowerCase().includes(term) ||
              (s.nit && s.nit.toLowerCase().includes(term)),
          )
        : all;
      const start = (page - 1) * limit;
      const slice = filtered.slice(start, start + limit);
      return { data: slice, total: filtered.length };
    },
  });

  const handleNew = () => {
    setSelectedSupplier(null);
    setFormData({ name: '', contactName: '', email: '', phone: '', nit: '', address: '' });
    setIsModalOpen(true);
  };

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      name: supplier.name,
      contactName: supplier.contactName || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      nit: supplier.nit || '',
      address: supplier.address || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const url = selectedSupplier ? `/api/suppliers/${selectedSupplier.id}` : '/api/suppliers';
    const method = selectedSupplier ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setIsModalOpen(false);
        void table.refetch();
        toast({
          tone: 'success',
          message: selectedSupplier ? 'Proveedor actualizado correctamente.' : 'Proveedor creado correctamente.',
        });
      } else {
        const data = await res.json();
        toast({ tone: 'error', message: data.error || 'Error al guardar' });
      }
    } catch {
      toast({ tone: 'error', message: 'Error de red' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSupplier) return;
    const accepted = await confirm({
      title: 'Desactivar proveedor',
      message: '¿Estás seguro de desactivar este proveedor? Sus registros de compra históricos se mantendrán.',
      confirmText: 'Desactivar',
      cancelText: 'Cancelar',
      tone: 'danger',
    });
    if (!accepted) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/suppliers/${selectedSupplier.id}`, { method: 'DELETE' });
      if (res.ok) {
        setIsModalOpen(false);
        void table.refetch();
        toast({ tone: 'success', message: 'Proveedor desactivado correctamente.' });
      } else {
        const data = await res.json();
        toast({ tone: 'error', message: data.error || 'Error al desactivar proveedor.' });
      }
    } catch {
      toast({ tone: 'error', message: 'Error de red' });
    } finally {
      setIsSaving(false);
    }
  };

  const columns: DataTableColumn<Supplier>[] = [
    {
      key: 'name',
      header: 'Empresa / Razón Social',
      mobilePriority: 'title',
      accessor: (s) => (
        <div>
          <div className="font-bold text-slate-800">{s.name}</div>
          {s.address && <div className="text-xs text-slate-500">{s.address}</div>}
        </div>
      ),
      exportValue: (s) => s.name,
    },
    {
      key: 'contact',
      header: 'Contacto',
      mobilePriority: 'meta',
      accessor: (s) => (
        <div>
          <div className="text-slate-800 font-medium">{s.contactName || '-'}</div>
          <div className="text-xs text-slate-500">{s.phone || ''}</div>
        </div>
      ),
      exportValue: (s) => `${s.contactName || ''} / ${s.phone || ''}`,
    },
    {
      key: 'nit',
      header: 'NIT',
      mobilePriority: 'highlight',
      accessor: (s) => <span className="font-mono text-slate-600">{s.nit || 'N/A'}</span>,
      exportValue: (s) => s.nit || '',
    },
    {
      key: 'actions',
      header: 'Acciones',
      mobilePriority: 'hidden',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (s) => (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleEdit(s)}
            aria-label="Editar"
            title="Editar"
            className="text-slate-600 hover:text-indigo-600 transition-colors p-2 rounded-lg hover:bg-indigo-50"
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
          { label: 'Proveedores' },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Truck className="w-6 h-6 text-indigo-600" />
            Directorio de Proveedores
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestiona tus socios logísticos y distribuidores mayoristas.
          </p>
        </div>
        <button
          onClick={handleNew}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> Registrar Proveedor
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
        getRowId={(s) => s.id}
        search={{
          value: table.search.value,
          onChange: table.search.onChange,
          placeholder: 'Buscar por empresa o NIT...',
        }}
        empty={
          <EmptyState
            icon={<Truck className="w-7 h-7" />}
            title="No hay proveedores"
            description="Registra tu primer proveedor para empezar a comprar inventario."
            action={
              <button
                onClick={handleNew}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Registrar Proveedor
              </button>
            }
          />
        }
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="font-bold text-lg text-slate-800">
                {selectedSupplier ? 'Ficha del Proveedor' : 'Nuevo Proveedor'}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Razón Social / Empresa *</label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none"
                    placeholder="Distribuidora S.A."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">NIT</label>
                  <input
                    type="text"
                    value={formData.nit}
                    onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Representante de Ventas</label>
                  <input
                    type="text"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none"
                    placeholder="Nombre visible del vendedor o contacto."
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none"
                    placeholder="ventas@empresa.com"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dirección Registrada</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 mt-4 items-center">
                {selectedSupplier && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="mr-auto text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Eliminar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-xl font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Save className="w-4 h-4" /> Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
