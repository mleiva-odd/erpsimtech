'use client';

/**
 * Fase 22b · Delivery notes con DataTable + useDataTable.
 *
 * Endpoint `/api/delivery-notes` soporta paginación servidor + filtro `status`.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Truck, Package, MapPin, Phone, ChevronRight, RefreshCw,
  CheckCircle2, Clock, Send, XCircle, Printer,
} from 'lucide-react';
import { useBranchStore } from '@/stores/branchStore';
import { useToast } from '@/components/ui/toast';
import { DeliveryNoteModal } from '@/components/sales/DeliveryNoteModal';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface DeliveryNoteItem {
  id: string;
  quantity: number;
  product: { name: string; sku: string };
  variant: { name: string } | null;
}

interface DeliveryNote {
  id: string;
  noteNumber: string | null;
  recipientName: string;
  address: string;
  phone: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  customer: { name: string } | null;
  user: { name: string };
  sale: { id: string; total: number } | null;
  branch: { name: string } | null;
  items: DeliveryNoteItem[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <Clock className="w-3.5 h-3.5" /> },
  DISPATCHED: { label: 'Despachada', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: <Send className="w-3.5 h-3.5" /> },
  DELIVERED: { label: 'Entregada', color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  CANCELLED: { label: 'Cancelada', color: 'bg-red-100 text-red-700 border-red-200', icon: <XCircle className="w-3.5 h-3.5" /> },
};

export default function DeliveryNotesPage() {
  const { toast } = useToast();
  const { selectedBranchId } = useBranchStore();
  const [selectedNote, setSelectedNote] = useState<DeliveryNote | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showPrintNote, setShowPrintNote] = useState<string | null>(null);

  const table = useDataTable<DeliveryNote>({
    defaultLimit: 25,
    onFetch: async ({ page, limit, filters, signal }) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (filters.status) params.set('status', String(filters.status));
      if (selectedBranchId) params.set('branchId', selectedBranchId);
      const res = await fetch(`/api/delivery-notes?${params}`, { signal });
      if (!res.ok) throw new Error('Error al cargar notas de envío.');
      const json = await res.json();
      return { data: json.data ?? [], total: json.total ?? 0 };
    },
  });

  const updateStatus = async (noteId: string, newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/delivery-notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast({ tone: 'success', message: `Estado actualizado a ${STATUS_CONFIG[newStatus]?.label || newStatus}` });
      void table.refetch();
      setSelectedNote(null);
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error actualizando estado' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const columns: DataTableColumn<DeliveryNote>[] = [
    {
      key: 'noteNumber',
      header: 'No.',
      mobilePriority: 'meta',
      accessor: (n) => (
        <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
          {n.noteNumber}
        </span>
      ),
      exportValue: (n) => n.noteNumber || '',
    },
    {
      key: 'recipient',
      header: 'Destinatario',
      mobilePriority: 'title',
      accessor: (n) => (
        <div>
          <p className="font-bold text-slate-800">{n.recipientName}</p>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3" /> {n.address}
          </p>
        </div>
      ),
      exportValue: (n) => `${n.recipientName} (${n.address})`,
    },
    {
      key: 'status',
      header: 'Estado',
      mobilePriority: 'highlight',
      accessor: (n) => {
        const cfg = STATUS_CONFIG[n.status] || STATUS_CONFIG.PENDING;
        return (
          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg flex items-center gap-1 border w-fit ${cfg.color}`}>
            {cfg.icon} {cfg.label}
          </span>
        );
      },
      exportValue: (n) => STATUS_CONFIG[n.status]?.label || n.status,
    },
    {
      key: 'items',
      header: 'Productos',
      mobilePriority: 'meta',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (n) => <span className="text-sm text-slate-600">{n.items.length}</span>,
      exportValue: (n) => String(n.items.length),
    },
    {
      key: 'createdAt',
      header: 'Fecha',
      mobilePriority: 'meta',
      accessor: (n) => (
        <span className="text-xs text-slate-500">
          {format(new Date(n.createdAt), 'dd MMM yyyy, HH:mm', { locale: es })}
        </span>
      ),
      exportValue: (n) => format(new Date(n.createdAt), 'dd/MM/yyyy HH:mm'),
    },
    {
      key: 'phone',
      header: 'Teléfono',
      mobilePriority: 'hidden',
      accessor: (n) => n.phone || '—',
      exportValue: (n) => n.phone || '',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Ventas', href: '/sales' },
          { label: 'Notas de envío' },
        ]}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <Truck className="w-6 h-6 text-sky-600" /> Notas de Envío
          </h1>
          <p className="text-sm text-slate-500">Gestión de despachos y entregas</p>
        </div>
        <button
          onClick={() => void table.refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          aria-label="Actualizar"
        >
          <RefreshCw className={`w-4 h-4 ${table.loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[{ value: '', label: 'Todas' }, ...Object.entries(STATUS_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))].map((tab) => (
          <button
            key={tab.value || 'all'}
            onClick={() => table.setFilter('status', tab.value || '')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition border ${
              (table.filters.status ?? '') === tab.value
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
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
        onRowClick={(n) => setSelectedNote(n)}
        cardRenderer={(n) => {
          const cfg = STATUS_CONFIG[n.status] || STATUS_CONFIG.PENDING;
          return (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5 transition cursor-pointer">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">{n.noteNumber}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg flex items-center gap-1 border ${cfg.color}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-800">{n.recipientName}</h3>
                  <div className="flex flex-col gap-1 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {n.address}</span>
                    {n.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {n.phone}</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    {n.items.length} producto{n.items.length !== 1 ? 's' : ''} · {format(new Date(n.createdAt), 'dd MMM yyyy, HH:mm', { locale: es })}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
              </div>
            </div>
          );
        }}
        empty={
          <EmptyState
            icon={<Package className="w-7 h-7" />}
            title="Sin notas de envío"
            description="No hay despachos registrados para los filtros actuales."
          />
        }
      />

      {/* Detail Modal */}
      {selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-auto">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Nota {selectedNote.noteNumber}</h2>
                  <p className="text-xs text-slate-500 mt-1">{format(new Date(selectedNote.createdAt), 'dd/MM/yyyy HH:mm')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowPrintNote(selectedNote.id)} className="p-2 hover:bg-sky-50 text-sky-600 rounded-lg" aria-label="Imprimir">
                    <Printer className="w-5 h-5" />
                  </button>
                  <button onClick={() => setSelectedNote(null)} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Cerrar">
                    <XCircle className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Destinatario</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{selectedNote.recipientName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Teléfono</p>
                  <p className="text-sm text-slate-700 mt-1">{selectedNote.phone || '-'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Dirección</p>
                  <p className="text-sm text-slate-700 mt-1">{selectedNote.address}</p>
                </div>
                {selectedNote.notes && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Instrucciones</p>
                    <p className="text-sm text-slate-700 mt-1">{selectedNote.notes}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Productos</p>
                <div className="space-y-2">
                  {selectedNote.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="text-sm font-medium text-slate-700">
                        {item.product.name}{item.variant && ` — ${item.variant.name}`}
                      </p>
                      <span className="text-sm font-bold text-slate-800 bg-white px-3 py-1 rounded-lg border border-slate-200">
                        ×{item.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                {selectedNote.status === 'PENDING' && (
                  <>
                    <button onClick={() => updateStatus(selectedNote.id, 'DISPATCHED')} disabled={updatingStatus} className="flex-1 py-3 font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition disabled:opacity-50">
                      <Send className="w-4 h-4 inline mr-2" /> Marcar Despachada
                    </button>
                    <button onClick={() => updateStatus(selectedNote.id, 'CANCELLED')} disabled={updatingStatus} className="py-3 px-4 font-bold text-sm text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-xl transition disabled:opacity-50">
                      Cancelar
                    </button>
                  </>
                )}
                {selectedNote.status === 'DISPATCHED' && (
                  <>
                    <button onClick={() => updateStatus(selectedNote.id, 'DELIVERED')} disabled={updatingStatus} className="flex-1 py-3 font-bold text-sm text-white bg-green-600 hover:bg-green-700 rounded-xl transition disabled:opacity-50">
                      <CheckCircle2 className="w-4 h-4 inline mr-2" /> Marcar Entregada
                    </button>
                    <button onClick={() => updateStatus(selectedNote.id, 'CANCELLED')} disabled={updatingStatus} className="py-3 px-4 font-bold text-sm text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-xl transition disabled:opacity-50">
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showPrintNote && (
        <DeliveryNoteModal noteId={showPrintNote} onClose={() => setShowPrintNote(null)} />
      )}
    </div>
  );
}
