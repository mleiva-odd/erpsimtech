'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Truck, Package, MapPin, Phone, ChevronRight, RefreshCw,
  CheckCircle2, Clock, Send, XCircle, Printer
} from 'lucide-react';
import { useBranchStore } from '@/stores/branchStore';
import { useToast } from '@/components/ui/toast';
import { DeliveryNoteModal } from '@/components/sales/DeliveryNoteModal';

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

  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedNote, setSelectedNote] = useState<DeliveryNote | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showPrintNote, setShowPrintNote] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (selectedBranchId) params.set('branchId', selectedBranchId);
      const res = await fetch(`/api/delivery-notes?${params}`);
      const data = await res.json();
      setNotes(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedBranchId]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

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
      loadNotes();
      setSelectedNote(null);
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error actualizando estado' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <Truck className="w-6 h-6 text-sky-600" /> Notas de Envío
          </h1>
          <p className="text-sm text-slate-500">Gestión de despachos y entregas</p>
        </div>
        <button onClick={loadNotes} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[{ value: '', label: 'Todas' }, ...Object.entries(STATUS_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))].map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition border ${statusFilter === tab.value ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notes list */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-blue-500" /></div>
        ) : notes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No hay notas de envío.</p>
          </div>
        ) : (
          notes.map(note => {
            const statusCfg = STATUS_CONFIG[note.status] || STATUS_CONFIG.PENDING;
            return (
              <div key={note.id} onClick={() => setSelectedNote(note)} className="bg-white rounded-2xl border border-slate-100 p-5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5 transition cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">{note.noteNumber}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg flex items-center gap-1 border ${statusCfg.color}`}>
                        {statusCfg.icon} {statusCfg.label}
                      </span>
                      {note.sale && <span className="text-[10px] text-slate-400">• Venta #{note.sale.id.split('-')[0].toUpperCase()}</span>}
                    </div>
                    <h3 className="font-bold text-slate-800">{note.recipientName}</h3>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {note.address}</span>
                      {note.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {note.phone}</span>}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      {note.items.length} producto{note.items.length > 1 ? 's' : ''} • {format(new Date(note.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Detail Modal */}
      {selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-auto">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Nota {selectedNote.noteNumber}</h2>
                  <p className="text-xs text-slate-500 mt-1">{format(new Date(selectedNote.createdAt), "dd/MM/yyyy HH:mm")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowPrintNote(selectedNote.id)} className="p-2 hover:bg-sky-50 text-sky-600 rounded-lg"><Printer className="w-5 h-5" /></button>
                  <button onClick={() => setSelectedNote(null)} className="p-2 hover:bg-slate-100 rounded-lg"><XCircle className="w-5 h-5 text-slate-400" /></button>
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
                  {selectedNote.items.map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {item.product.name}{item.variant && ` — ${item.variant.name}`}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-slate-800 bg-white px-3 py-1 rounded-lg border border-slate-200">
                        ×{item.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Actions */}
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
