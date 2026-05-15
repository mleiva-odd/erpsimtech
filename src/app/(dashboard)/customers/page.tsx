'use client';

/**
 * Fase 22b · Customers con DataTable + useDataTable.
 *
 * Endpoint `/api/customers` ya soporta paginación servidor (page, limit, q).
 * Mantenemos modales de edición y abono.
 */

import { useState } from 'react';
import { Plus, CreditCard, UserCircle, Edit2, ShieldAlert, Users } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nit: string | null;
  address: string | null;
  creditLimit: number | string;
  balance: number | string;
}

export default function CustomersPage() {
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', nit: '', address: '', creditLimit: 0,
  });

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  const table = useDataTable<Customer>({
    defaultLimit: 25,
    onFetch: async ({ page, limit, search, signal }) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        q: search,
      });
      const res = await fetch(`/api/customers?${params}`, { signal });
      if (!res.ok) throw new Error('Error al cargar clientes.');
      const json = await res.json();
      return { data: json.data ?? [], total: json.total ?? 0 };
    },
  });

  const handleEdit = (c: Customer) => {
    setSelectedId(c.id);
    setFormData({
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      nit: c.nit || '',
      address: c.address || '',
      creditLimit: Number(c.creditLimit) || 0,
    });
    setIsModalOpen(true);
  };

  const handleNew = () => {
    setSelectedId(null);
    setFormData({ name: '', email: '', phone: '', nit: '', address: '', creditLimit: 0 });
    setIsModalOpen(true);
  };

  const handlePay = (c: Customer) => {
    setPaymentCustomer(c);
    setPaymentAmount('');
    setIsPaymentModalOpen(true);
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCustomer) return;
    setIsPaying(true);
    try {
      const res = await fetch(`/api/customers/${paymentCustomer.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(paymentAmount) }),
      });
      if (res.ok) {
        setIsPaymentModalOpen(false);
        toast({ tone: 'success', message: `Abono registrado correctamente para ${paymentCustomer.name}.` });
        void table.refetch();
      } else {
        const error = await res.json();
        toast({ tone: 'error', message: error.error || 'Error al procesar el abono' });
      }
    } catch {
      toast({ tone: 'error', message: 'Error de conexión al procesar abono' });
    } finally {
      setIsPaying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = selectedId ? `/api/customers/${selectedId}` : '/api/customers';
    const method = selectedId ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setIsModalOpen(false);
        toast({
          tone: 'success',
          message: selectedId ? 'Cliente actualizado correctamente.' : 'Cliente creado correctamente.',
        });
        void table.refetch();
      } else {
        toast({ tone: 'error', message: 'Error al guardar cliente.' });
      }
    } catch {
      toast({ tone: 'error', message: 'Error de conexión al guardar cliente.' });
    }
  };

  const columns: DataTableColumn<Customer>[] = [
    {
      key: 'name',
      header: 'Cliente',
      mobilePriority: 'title',
      accessor: (c) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <UserCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-800">{c.name}</div>
            {c.address && <div className="text-xs text-slate-500 truncate w-32">{c.address}</div>}
          </div>
        </div>
      ),
      exportValue: (c) => c.name,
    },
    {
      key: 'nit',
      header: 'NIT',
      mobilePriority: 'meta',
      accessor: (c) => (
        <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-mono font-medium">
          {c.nit || 'C/F'}
        </span>
      ),
      exportValue: (c) => c.nit || 'C/F',
    },
    {
      key: 'contact',
      header: 'Contacto',
      mobilePriority: 'meta',
      accessor: (c) => (
        <div className="text-slate-600">
          <div className="font-medium">{c.phone || '-'}</div>
          <div className="text-xs text-slate-600">{c.email || 'Sin correo asociado'}</div>
        </div>
      ),
      exportValue: (c) => `${c.phone || ''} / ${c.email || ''}`,
    },
    {
      key: 'balance',
      header: 'Saldo (Deuda)',
      mobilePriority: 'highlight',
      cellClassName: 'text-right',
      headerClassName: 'text-right',
      accessor: (c) => {
        const hasDebt = Number(c.balance) > 0;
        return (
          <span className={`font-bold ${hasDebt ? 'text-rose-600' : 'text-slate-500'}`}>
            Q{Number(c.balance).toFixed(2)}
          </span>
        );
      },
      exportValue: (c) => Number(c.balance).toFixed(2),
    },
    {
      key: 'creditLimit',
      header: 'Límite',
      mobilePriority: 'meta',
      cellClassName: 'text-right',
      headerClassName: 'text-right',
      accessor: (c) => {
        const hasDebt = Number(c.balance) > 0;
        const nearLimit = hasDebt && Number(c.creditLimit) > 0 && Number(c.balance) / Number(c.creditLimit) > 0.8;
        return (
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            {nearLimit && <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />}
            Q{Number(c.creditLimit).toFixed(2)}
          </span>
        );
      },
      exportValue: (c) => Number(c.creditLimit).toFixed(2),
    },
    {
      key: 'actions',
      header: 'Acciones',
      mobilePriority: 'hidden',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (c) => {
        const hasDebt = Number(c.balance) > 0;
        return (
          <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => handleEdit(c)} className="text-slate-600 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50" aria-label="Editar" title="Editar">
              <Edit2 className="w-4 h-4" />
            </button>
            {hasDebt && (
              <button
                onClick={() => handlePay(c)}
                className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-md hover:bg-emerald-200 transition"
                title="Recibir Abono"
              >
                Abonar
              </button>
            )}
          </div>
        );
      },
      exportValue: () => '',
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Clientes' },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Control de Clientes
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Directorio, gestión de carteras y límites de crédito autorizado
          </p>
        </div>
        <button
          onClick={handleNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> Nuevo Cliente
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
        getRowId={(c) => c.id}
        search={{
          value: table.search.value,
          onChange: table.search.onChange,
          placeholder: 'Buscar por empresa, NIT, teléfono...',
        }}
        empty={
          <EmptyState
            icon={<Users className="w-7 h-7" />}
            title="No hay clientes"
            description="Crea tu primer cliente para empezar a vender a crédito."
            action={
              <button
                onClick={handleNew}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Nuevo Cliente
              </button>
            }
          />
        }
      />

      {/* Payment Modal */}
      {isPaymentModalOpen && paymentCustomer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col p-6 text-center">
            <h3 className="font-bold text-xl text-slate-800 mb-2">Recibir Abono</h3>
            <p className="text-sm text-slate-500 mb-6">
              Deuda actual de {paymentCustomer.name}:{' '}
              <strong className="text-rose-600">Q{Number(paymentCustomer.balance).toFixed(2)}</strong>
            </p>
            <form onSubmit={submitPayment} className="space-y-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 font-bold">Q</span>
                <input
                  type="number"
                  autoFocus
                  required
                  step="0.01"
                  min="0.01"
                  max={Number(paymentCustomer.balance)}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full text-center text-xl font-bold bg-slate-50 border border-slate-200 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-600 font-bold py-2.5 rounded-xl hover:bg-slate-200 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPaying}
                  className="flex-1 bg-emerald-600 text-white font-bold py-2.5 rounded-xl hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {isPaying ? '...' : 'Confirmar Abono'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-800">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-bold">{selectedId ? 'Editar Cliente' : 'Registro de Cliente'}</h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Cerrar"
                className="text-slate-600 hover:text-slate-600 transition-colors"
              >
                X
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <form id="customerForm" onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Nombre Comercial / Completo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Ej: Supermercados La Torre"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">NIT</label>
                    <input
                      type="text"
                      placeholder="Ej: 1234567-8"
                      value={formData.nit}
                      onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Teléfono</label>
                    <input
                      type="text"
                      placeholder="Ej: +502 0000-0000"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      placeholder="cliente@correo.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Dirección de Facturación</label>
                  <input
                    type="text"
                    placeholder="12 Calle, Zona x, Ciudad"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  />
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-2">
                  <label className="block text-sm font-bold text-slate-800 mb-1">Límite de Crédito (Q)</label>
                  <p className="text-[11px] text-slate-500 font-medium mb-2 leading-relaxed">
                    Monto máximo de fiado permitido. Si se establece en &quot;0&quot;, el cliente solo podrá realizar compras de contado.
                  </p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 font-medium">Q</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={formData.creditLimit}
                      onChange={(e) => setFormData({ ...formData, creditLimit: Number(e.target.value) })}
                      className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                </div>
              </form>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="customerForm"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                {selectedId ? 'Actualizar' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
