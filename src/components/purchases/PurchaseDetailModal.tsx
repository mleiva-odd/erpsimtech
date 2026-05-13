'use client';

/**
 * Fase 22b · Detalle de PO con acciones enterprise:
 *  - Aprobar (si DRAFT/PENDING_APPROVAL).
 *  - Recibir mercadería (GRN, parcial o total).
 *  - Registrar factura proveedor.
 *  - Registrar nota de crédito proveedor.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, PackageCheck, Receipt, FileMinus, Check } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/toast';

interface POItem {
  id: string;
  productId: string;
  variantId?: string | null;
  quantity: number | string;
  quantityReceived?: number | string | null;
  quantityInvoiced?: number | string | null;
  cost: number | string;
  taxRate?: number | string | null;
  product?: { id: string; name: string; sku: string };
  variant?: { id: string; name: string } | null;
}

interface PO {
  id: string;
  status: string;
  reference?: string | null;
  total: number | string;
  subtotal?: number | string;
  tax?: number | string;
  landedCost?: number | string | null;
  createdAt: string;
  supplier: { id: string; name: string; nit?: string | null; withholdsIVA?: boolean; withholdsISR?: boolean };
  user?: { name?: string | null };
  items: POItem[];
  hasInvoice?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING_APPROVAL: 'Pendiente aprobación',
  APPROVED: 'Aprobada',
  PARTIALLY_RECEIVED: 'Parcialmente recibida',
  RECEIVED: 'Recibida',
  INVOICED: 'Facturada',
  CANCELLED: 'Anulada',
  COMPLETED: 'Completada',
};

function formatQ(n: number | string): string {
  return `Q${Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PurchaseDetailModal({
  purchaseId,
  onClose,
  onRefresh,
}: {
  purchaseId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [po, setPo] = useState<PO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showGRN, setShowGRN] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showCN, setShowCN] = useState(false);

  const fetchPO = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/purchases/${purchaseId}`);
      const data = await res.json();
      if (res.ok) setPo(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [purchaseId]);

  useEffect(() => { void fetchPO(); }, [fetchPO]);

  const approve = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/purchases/${purchaseId}/approve`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      toast({ tone: 'success', message: 'PO aprobada.' });
      void fetchPO();
      onRefresh();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-6 flex justify-between items-start border-b border-slate-100">
          <div>
            <h3 className="text-xl font-bold text-slate-900">PO #{purchaseId.slice(0, 8).toUpperCase()}</h3>
            {po && (
              <p className="text-xs text-slate-500 mt-1">
                {STATUS_LABEL[po.status] || po.status} · {format(new Date(po.createdAt), 'dd/MM/yyyy')} ·{' '}
                {po.supplier.name}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading || !po ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-500 opacity-40" />
          </div>
        ) : (
          <>
            <div className="p-6 overflow-auto flex-1 space-y-4">
              <div className="bg-slate-50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold uppercase">Producto</th>
                      <th className="px-3 py-2 text-center font-bold uppercase">Pedido</th>
                      <th className="px-3 py-2 text-center font-bold uppercase">Recibido</th>
                      <th className="px-3 py-2 text-center font-bold uppercase">Facturado</th>
                      <th className="px-3 py-2 text-right font-bold uppercase">Costo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {po.items.map((it) => (
                      <tr key={it.id} className="bg-white">
                        <td className="px-3 py-2">
                          <p className="font-bold">{it.product?.name || it.productId}</p>
                          <p className="text-[10px] text-slate-500">{it.product?.sku}</p>
                        </td>
                        <td className="px-3 py-2 text-center">{Number(it.quantity)}</td>
                        <td className="px-3 py-2 text-center text-emerald-700 font-bold">{Number(it.quantityReceived ?? 0)}</td>
                        <td className="px-3 py-2 text-center text-blue-700 font-bold">{Number(it.quantityInvoiced ?? 0)}</td>
                        <td className="px-3 py-2 text-right">{formatQ(it.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-1 text-sm">
                {po.subtotal != null && (
                  <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatQ(po.subtotal)}</span></div>
                )}
                {po.tax != null && Number(po.tax) > 0 && (
                  <div className="flex justify-between"><span className="text-slate-500">IVA</span><span>{formatQ(po.tax)}</span></div>
                )}
                {po.landedCost != null && Number(po.landedCost) > 0 && (
                  <div className="flex justify-between"><span className="text-slate-500">Landed cost</span><span>{formatQ(po.landedCost)}</span></div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
                  <span>Total</span><span>{formatQ(po.total)}</span>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
              {(po.status === 'DRAFT' || po.status === 'PENDING_APPROVAL') && (
                <button
                  disabled={busy}
                  onClick={approve}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-md disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Aprobar
                </button>
              )}
              {(po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED') && (
                <button
                  onClick={() => setShowGRN(true)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-md"
                >
                  <PackageCheck className="w-4 h-4" /> Recibir mercadería
                </button>
              )}
              {(po.status === 'RECEIVED' || po.status === 'PARTIALLY_RECEIVED') && !po.hasInvoice && (
                <button
                  onClick={() => setShowInvoice(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-md"
                >
                  <Receipt className="w-4 h-4" /> Factura proveedor
                </button>
              )}
              {(po.status === 'INVOICED' || po.hasInvoice) && (
                <button
                  onClick={() => setShowCN(true)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-md"
                >
                  <FileMinus className="w-4 h-4" /> Nota crédito
                </button>
              )}
            </div>
          </>
        )}

        {showGRN && po && (
          <GRNModal
            po={po}
            onClose={() => setShowGRN(false)}
            onDone={() => {
              setShowGRN(false);
              void fetchPO();
              onRefresh();
            }}
          />
        )}
        {showInvoice && po && (
          <InvoiceModal
            po={po}
            onClose={() => setShowInvoice(false)}
            onDone={() => {
              setShowInvoice(false);
              void fetchPO();
              onRefresh();
            }}
          />
        )}
        {showCN && po && (
          <CreditNoteModal
            po={po}
            onClose={() => setShowCN(false)}
            onDone={() => {
              setShowCN(false);
              void fetchPO();
              onRefresh();
            }}
          />
        )}
      </div>
    </div>
  );
}

function GRNModal({ po, onClose, onDone }: { po: PO; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState(
    po.items.map((it) => ({
      purchaseOrderItemId: it.id,
      productName: it.product?.name || 'Producto',
      pending: Math.max(0, Number(it.quantity) - Number(it.quantityReceived ?? 0)),
      quantityReceived: 0,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const landedPreview = Number(po.landedCost ?? 0);
  const totalReceived = items.reduce((acc, i) => acc + i.quantityReceived, 0);
  const totalPending = items.reduce((acc, i) => acc + i.pending, 0);
  const proratePreview = totalPending > 0 ? landedPreview * (totalReceived / totalPending) : 0;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = items
        .filter((i) => i.quantityReceived > 0)
        .map((i) => ({ purchaseOrderItemId: i.purchaseOrderItemId, quantityReceived: i.quantityReceived }));
      if (payload.length === 0) throw new Error('Indica al menos un ítem a recibir');
      const res = await fetch(`/api/purchases/${po.id}/grn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      toast({ tone: 'success', message: 'Recepción registrada.' });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 flex justify-between items-start border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-900">Recibir mercadería</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 overflow-auto flex-1 space-y-3">
          {items.map((it, idx) => (
            <div key={idx} className="bg-slate-50 rounded-lg p-3 flex flex-wrap gap-2 items-center">
              <div className="flex-1 min-w-[160px]">
                <p className="text-sm font-bold">{it.productName}</p>
                <p className="text-[10px] text-slate-500">Pendiente: {it.pending}</p>
              </div>
              <input
                type="number"
                min="0"
                max={it.pending}
                value={it.quantityReceived}
                onChange={(e) => {
                  const v = Math.min(it.pending, parseFloat(e.target.value) || 0);
                  setItems(items.map((x, i) => (i === idx ? { ...x, quantityReceived: v } : x)));
                }}
                className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          ))}
          {landedPreview > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-700">
              Prorrateo landed cost preview: <strong>{formatQ(proratePreview)}</strong>
            </div>
          )}
          {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl">Cancelar</button>
          <button
            disabled={busy}
            onClick={submit}
            className="flex-1 py-3 font-bold text-white bg-emerald-600 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmar recepción
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceModal({ po, onClose, onDone }: { po: PO; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [subtotal, setSubtotal] = useState(Number(po.subtotal ?? po.total ?? 0));
  const [tax, setTax] = useState(Number(po.tax ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const withholdsIVA = po.supplier.withholdsIVA ?? false;
  const withholdsISR = po.supplier.withholdsISR ?? false;
  const previewIVAW = withholdsIVA ? tax * 0.15 : 0; // aproximado; el backend recalcula
  const previewISRW = withholdsISR ? subtotal * 0.05 : 0;
  const total = subtotal + tax - previewIVAW - previewISRW;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (!invoiceNumber.trim()) throw new Error('Número de factura requerido');
      const res = await fetch(`/api/purchases/${po.id}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber,
          invoiceDate,
          subtotal,
          tax,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      toast({ tone: 'success', message: 'Factura registrada.' });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="p-6 flex justify-between items-start border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-900">Registrar factura proveedor</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">N° Factura</label>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 border-2 border-slate-100 rounded-lg outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Fecha</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 border-2 border-slate-100 rounded-lg outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Subtotal</label>
              <input
                type="number"
                step="0.01"
                value={subtotal}
                onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border-2 border-slate-100 rounded-lg outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">IVA</label>
              <input
                type="number"
                step="0.01"
                value={tax}
                onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border-2 border-slate-100 rounded-lg outline-none text-sm"
              />
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-sm space-y-1">
            {withholdsIVA && (
              <div className="flex justify-between text-rose-600"><span>Retención IVA (preview)</span><span>-{formatQ(previewIVAW)}</span></div>
            )}
            {withholdsISR && (
              <div className="flex justify-between text-rose-600"><span>Retención ISR (preview)</span><span>-{formatQ(previewISRW)}</span></div>
            )}
            <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
              <span>Total</span><span>{formatQ(total)}</span>
            </div>
            <p className="text-[10px] text-slate-500 italic">Las retenciones definitivas se calculan en el servidor con los regímenes del proveedor.</p>
          </div>
          {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl">Cancelar</button>
          <button
            disabled={busy}
            onClick={submit}
            className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl shadow-md disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreditNoteModal({ po, onClose, onDone }: { po: PO; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [noteNumber, setNoteNumber] = useState('');
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (!noteNumber.trim() || !reason.trim()) throw new Error('Número y razón obligatorios');
      const res = await fetch(`/api/purchases/${po.id}/credit-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteNumber, noteDate, reason, subtotal, tax }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      toast({ tone: 'success', message: 'Nota de crédito registrada.' });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="p-6 flex justify-between items-start border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-900">Nota de crédito proveedor</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">N° NC</label>
              <input
                value={noteNumber}
                onChange={(e) => setNoteNumber(e.target.value)}
                className="w-full px-3 py-2 border-2 border-slate-100 rounded-lg outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Fecha</label>
              <input
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                className="w-full px-3 py-2 border-2 border-slate-100 rounded-lg outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Subtotal</label>
              <input
                type="number"
                step="0.01"
                value={subtotal}
                onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border-2 border-slate-100 rounded-lg outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">IVA</label>
              <input
                type="number"
                step="0.01"
                value={tax}
                onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border-2 border-slate-100 rounded-lg outline-none text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Motivo</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border-2 border-slate-100 rounded-lg outline-none resize-none text-sm"
            />
          </div>
          {error && <p className="text-rose-500 text-xs font-bold">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl">Cancelar</button>
          <button
            disabled={busy}
            onClick={submit}
            className="flex-1 py-3 font-bold text-white bg-amber-600 rounded-xl shadow-md disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
