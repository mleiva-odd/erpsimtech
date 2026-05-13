'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft, Printer, Undo2, XCircle, Package, User, Building2,
  CreditCard, Calendar, Wifi, Store, Truck, X, Loader2, AlertTriangle,
  ShieldCheck, FileCheck2, FileX2
} from 'lucide-react';
import { TicketModal } from '@/components/pos/TicketModal';
import { CreateDeliveryNoteModal } from '@/components/sales/CreateDeliveryNoteModal';
import { useToast } from '@/components/ui/toast';

interface TaxDocumentLite {
  id: string;
  type: string;
  numeroDisplay: string;
  status: string;
  dteUuid: string | null;
  autorizacion: string | null;
  fechaCertificacion: string | null;
  emisorNit: string;
  receptorNit: string;
  receptorNombre: string;
  taxRegime: string;
  provider: string;
  xmlFirmado: string | null;
  cancelledById: string | null;
}

interface SaleDetail {
  id: string;
  total: number;
  subtotal: number;
  discount: number;
  tax: number;
  status: string;
  channel: string;
  createdAt: string;
  invoiceNumber: string | null;
  user: { name: string };
  customer: { name: string; nit: string | null; address: string | null } | null;
  branch: { name: string } | null;
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    unitCost: number | null;
    subtotal: number;
    discount: number;
    product: { id: string; name: string; sku: string };
    variant: { id: string; name: string; sku: string } | null;
    returnItems: Array<{ quantity: number }>;
  }>;
  payments: Array<{ method: string; amount: number; reference: string | null }>;
  returns: Array<{
    id: string;
    amount: number;
    reason: string;
    stockAdded: boolean;
    createdAt: string;
    items: Array<{ quantity: number; amount: number; saleItemId: string }>;
  }>;
}

const CHANNEL_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  POS: { label: 'Punto de Venta', icon: <Store className="w-4 h-4" />, color: 'bg-green-100 text-green-700' },
  REMOTE: { label: 'Venta Remota', icon: <Wifi className="w-4 h-4" />, color: 'bg-purple-100 text-purple-700' },
  WEB: { label: 'Venta Web', icon: <Package className="w-4 h-4" />, color: 'bg-sky-100 text-sky-700' },
};
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  QUOTE: 'bg-blue-100 text-blue-700',
  ORDER: 'bg-indigo-100 text-indigo-700',
  PARTIALLY_DELIVERED: 'bg-amber-100 text-amber-700',
  DELIVERED: 'bg-sky-100 text-sky-700',
  INVOICED: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
};
const METHOD_LABELS: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', CREDIT: 'Crédito' };

export default function SaleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const saleId = params.id as string;
  const { toast } = useToast();

  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTicket, setShowTicket] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showDeliveryNote, setShowDeliveryNote] = useState(false);

  // FEL state
  const [taxDocument, setTaxDocument] = useState<TaxDocumentLite | null>(null);
  const [certifyingFel, setCertifyingFel] = useState(false);
  const [felError, setFelError] = useState<string | null>(null);
  const [showFelCancel, setShowFelCancel] = useState(false);
  const [felCancelMotivo, setFelCancelMotivo] = useState('');
  const [cancellingFel, setCancellingFel] = useState(false);

  // Return modal state
  const [returnItems, setReturnItems] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnReference, setReturnReference] = useState('');
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CARD' | 'TRANSFER'>('CASH');
  const [returnStockAdded, setReturnStockAdded] = useState(true);
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [returnError, setReturnError] = useState('');

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);

  const fetchSale = useCallback(async () => {
    try {
      const res = await fetch(`/api/sales/${saleId}`);
      const data = await res.json();
      if (data.sale) setSale(data.sale);
    } catch (e) {
      console.error(e);
    }
  }, [saleId]);

  // Heurística para detectar FEL ya certificada: si Sale.invoiceNumber tiene
  // formato "PREFIX-NNNNN" (definido por el endpoint de certify), hacemos un
  // POST idempotente al certify para traer el TaxDocument completo.
  const fetchTaxDocumentIfCertified = useCallback(
    async (sale: SaleDetail) => {
      if (!sale.invoiceNumber || sale.status !== 'COMPLETED') return;
      try {
        const res = await fetch(`/api/fel/certify/${sale.id}`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.alreadyCertified && data.taxDocument) {
            setTaxDocument(data.taxDocument);
          } else if (data.taxDocument) {
            setTaxDocument(data.taxDocument);
          }
        }
        // Si no es OK, asumimos que aún no está certificada y se mostrará el botón.
      } catch {
        // silenciar
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/sales/${saleId}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.sale) {
          setSale(data.sale);
          // Probe FEL en background (no bloquea UI).
          void fetchTaxDocumentIfCertified(data.sale);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [saleId, fetchTaxDocumentIfCertified]);

  const handleCertifyFel = async () => {
    if (!sale) return;
    setCertifyingFel(true);
    setFelError(null);
    try {
      const res = await fetch(`/api/fel/certify/${sale.id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || 'Error certificando FEL.';
        setFelError(msg);
        toast({ tone: 'error', message: msg });
        return;
      }
      if (data.taxDocument) setTaxDocument(data.taxDocument);
      toast({
        tone: 'success',
        message: `Factura certificada: ${data.taxDocument?.numeroDisplay ?? ''}`,
      });
      await fetchSale();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error de red';
      setFelError(msg);
      toast({ tone: 'error', message: msg });
    } finally {
      setCertifyingFel(false);
    }
  };

  const handleCancelFel = async () => {
    if (!taxDocument || !felCancelMotivo.trim()) {
      setFelError('Ingresa un motivo de anulación.');
      return;
    }
    setCancellingFel(true);
    setFelError(null);
    try {
      const res = await fetch(`/api/fel/cancel/${taxDocument.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: felCancelMotivo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || 'No se pudo anular el DTE.';
        setFelError(msg);
        toast({ tone: 'error', message: msg });
        return;
      }
      toast({ tone: 'success', message: 'DTE anulado. Se emitió NCRE asociada.' });
      setShowFelCancel(false);
      setFelCancelMotivo('');
      // Re-fetch
      await fetchSale();
      if (sale) await fetchTaxDocumentIfCertified(sale);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error de red';
      setFelError(msg);
      toast({ tone: 'error', message: msg });
    } finally {
      setCancellingFel(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CANCEL' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ tone: 'success', message: 'Venta anulada correctamente.' });
      setShowCancelModal(false);
      // Reload
      const reload = await fetch(`/api/sales/${saleId}`);
      const reloaded = await reload.json();
      if (reloaded.sale) setSale(reloaded.sale);
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error anulando venta' });
    } finally {
      setCancelling(false);
    }
  };

  const handleReturn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const items = Object.entries(returnItems)
      .filter(([, qty]) => qty > 0)
      .map(([saleItemId, quantity]) => ({ saleItemId, quantity }));

    if (items.length === 0) {
      setReturnError('Selecciona al menos una cantidad a devolver.');
      return;
    }
    if (!returnReason.trim()) {
      setReturnError('El motivo de devolución es obligatorio.');
      return;
    }

    setSubmittingReturn(true);
    setReturnError('');
    try {
      const res = await fetch(`/api/pos/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId,
          items,
          reason: returnReason,
          stockAdded: returnStockAdded,
          refundMethod,
          reference: returnReference.trim() || null
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ tone: 'success', message: 'Devolución procesada correctamente.' });
      setShowReturnModal(false);
      setReturnItems({});
      setReturnReason('');
      setReturnReference('');
      // Reload
      const reload = await fetch(`/api/sales/${saleId}`);
      const reloaded = await reload.json();
      if (reloaded.sale) setSale(reloaded.sale);
    } catch (e) {
      setReturnError(e instanceof Error ? e.message : 'Error procesando devolución');
    } finally {
      setSubmittingReturn(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Venta no encontrada.</p>
        <button onClick={() => router.push('/sales')} className="mt-4 text-blue-600 font-bold text-sm hover:underline">Volver a ventas</button>
      </div>
    );
  }

  const channelInfo = CHANNEL_LABELS[sale.channel] || CHANNEL_LABELS.POS;
  const canReturn = sale.status === 'COMPLETED';
  const canCancel = sale.status === 'COMPLETED';

  const callSaleAction = async (path: string, label: string) => {
    try {
      const res = await fetch(path, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error');
      toast({ tone: 'success', message: `${label} OK.` });
      await fetchSale();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    }
  };

  const cancelOrder = async () => {
    if (!confirm('¿Cancelar el pedido? Se liberan reservas y se reincorpora stock despachado.')) return;
    await callSaleAction(`/api/sales/${saleId}/cancel-order`, 'Pedido cancelado');
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/sales')} className="p-2 hover:bg-slate-100 rounded-xl transition">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">
                Venta #{sale.id.split('-')[0].toUpperCase()}
              </h1>
              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg ${STATUS_COLORS[sale.status] || 'bg-slate-100'}`}>
                {sale.status}
              </span>
              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg flex items-center gap-1 ${channelInfo.color}`}>
                {channelInfo.icon} {channelInfo.label}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {format(new Date(sale.createdAt), "EEEE dd 'de' MMMM yyyy, HH:mm", { locale: es })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {sale.status === 'QUOTE' && (
            <>
              <button
                onClick={() => callSaleAction(`/api/quotes/${saleId}/accept`, 'Cotización aceptada')}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition shadow-md"
              >
                Aceptar (convertir a Pedido)
              </button>
              <button
                onClick={() => callSaleAction(`/api/quotes/${saleId}/cancel`, 'Cotización cancelada')}
                className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-bold hover:bg-rose-100 transition"
              >
                Cancelar cotización
              </button>
            </>
          )}
          {(sale.status === 'ORDER' || sale.status === 'PARTIALLY_DELIVERED') && (
            <>
              <button
                onClick={() => setShowDeliveryNote(true)}
                className="flex items-center gap-2 px-4 py-2 bg-sky-50 border border-sky-200 rounded-xl text-sm font-bold text-sky-700 hover:bg-sky-100 transition"
              >
                <Truck className="w-4 h-4" /> Despachar
              </button>
              <button
                onClick={cancelOrder}
                className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-bold hover:bg-rose-100 transition"
              >
                Cancelar pedido
              </button>
            </>
          )}
          {sale.status === 'DELIVERED' && (
            <button
              onClick={() => callSaleAction(`/api/sales/${saleId}/invoice`, 'Facturación iniciada')}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition shadow-md"
            >
              <FileCheck2 className="w-4 h-4" /> Facturar
            </button>
          )}
          {sale.status === 'COMPLETED' && (
            <button onClick={() => setShowDeliveryNote(true)} className="flex items-center gap-2 px-4 py-2 bg-sky-50 border border-sky-200 rounded-xl text-sm font-bold text-sky-700 hover:bg-sky-100 transition">
              <Truck className="w-4 h-4" /> Generar Envío
            </button>
          )}
          <button onClick={() => setShowTicket(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition">
            <Printer className="w-4 h-4" /> Reimprimir
          </button>
          {canReturn && (
            <button onClick={() => setShowReturnModal(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm font-bold text-amber-700 hover:bg-amber-100 transition">
              <Undo2 className="w-4 h-4" /> Devolver
            </button>
          )}
          {canCancel && (
            <button onClick={() => setShowCancelModal(true)} disabled={cancelling} className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-600 hover:bg-red-100 transition disabled:opacity-50">
              <XCircle className="w-4 h-4" /> Anular
            </button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCard icon={<User className="w-4 h-4" />} label="Cliente" value={sale.customer?.name || 'Consumidor Final'} sub={sale.customer?.nit || ''} />
        <InfoCard icon={<Building2 className="w-4 h-4" />} label="Sucursal" value={sale.branch?.name || '-'} />
        <InfoCard icon={<User className="w-4 h-4" />} label="Vendedor" value={sale.user?.name || '-'} />
        <InfoCard icon={<Calendar className="w-4 h-4" />} label="Factura" value={sale.invoiceNumber || 'Sin factura'} />
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">Detalle de Productos</h2>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500 border-b border-slate-100">
              <th className="px-6 py-3 font-bold uppercase">Producto</th>
              <th className="px-6 py-3 font-bold uppercase text-center">Cant.</th>
              <th className="px-6 py-3 font-bold uppercase text-right">P.Unit</th>
              <th className="px-6 py-3 font-bold uppercase text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sale.items.map(item => {
              const returned = item.returnItems?.reduce((a, r) => a + r.quantity, 0) || 0;
              return (
                <tr key={item.id} className={returned >= item.quantity ? 'opacity-50 line-through' : ''}>
                  <td className="px-6 py-3">
                    <p className="text-sm font-medium text-slate-800">
                      {item.product.name}
                      {item.variant && <span className="text-slate-500"> — {item.variant.name}</span>}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">{item.variant?.sku || item.product.sku}</p>
                  </td>
                  <td className="px-6 py-3 text-center text-sm text-slate-700 font-bold">
                    {item.quantity}
                    {returned > 0 && <span className="text-red-500 text-[10px] block">-{returned} dev.</span>}
                  </td>
                  <td className="px-6 py-3 text-right text-sm text-slate-600">Q{Number(item.unitPrice).toFixed(2)}</td>
                  <td className="px-6 py-3 text-right text-sm font-bold text-slate-800">Q{Number(item.subtotal).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-200">
            {Number(sale.discount) > 0 && (
              <tr><td colSpan={3} className="px-6 py-2 text-right text-sm text-slate-500">Descuento ({Number(sale.discount)}%)</td><td className="px-6 py-2 text-right text-sm text-green-600 font-bold">-Q{((Number(sale.subtotal) * Number(sale.discount)) / 100).toFixed(2)}</td></tr>
            )}
            <tr><td colSpan={3} className="px-6 py-3 text-right text-sm font-bold text-slate-800 uppercase">Total</td><td className="px-6 py-3 text-right text-xl font-bold text-slate-900">Q{Number(sale.total).toFixed(2)}</td></tr>
          </tfoot>
        </table>
      </div>

      {/* Payments */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Métodos de Pago</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {sale.payments.map((p, i) => (
            <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs font-bold text-slate-500 uppercase">{METHOD_LABELS[p.method] || p.method}</p>
              <p className="text-lg font-bold text-slate-800 mt-1">Q{Number(p.amount).toFixed(2)}</p>
              {p.reference && <p className="text-[11px] text-slate-400 mt-1">Ref: {p.reference}</p>}
            </div>
          ))}
          {sale.payments.length === 0 && <p className="text-sm text-slate-400 italic">Sin pagos registrados</p>}
        </div>
      </div>

      {/* FEL Section */}
      {sale.status === 'COMPLETED' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> Facturación Electrónica (FEL)
          </h2>
          {felError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm mb-4">
              {felError}
            </div>
          )}
          {taxDocument ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoCard
                  icon={<FileCheck2 className="w-4 h-4" />}
                  label="Tipo · Número DTE"
                  value={`${taxDocument.type} · ${taxDocument.numeroDisplay}`}
                  sub={`Provider: ${taxDocument.provider}`}
                />
                <InfoCard
                  icon={<ShieldCheck className="w-4 h-4" />}
                  label="Estado"
                  value={
                    taxDocument.status === 'CERTIFIED'
                      ? 'Certificado'
                      : taxDocument.status === 'CANCELLED'
                        ? 'Anulado'
                        : taxDocument.status
                  }
                  sub={taxDocument.taxRegime}
                />
                <InfoCard
                  icon={<Calendar className="w-4 h-4" />}
                  label="Fecha certificación"
                  value={
                    taxDocument.fechaCertificacion
                      ? format(new Date(taxDocument.fechaCertificacion), 'dd/MM/yyyy HH:mm', { locale: es })
                      : '-'
                  }
                />
                <InfoCard
                  icon={<FileCheck2 className="w-4 h-4" />}
                  label="UUID"
                  value={taxDocument.dteUuid || '-'}
                  sub={taxDocument.autorizacion ? `Autorización: ${taxDocument.autorizacion}` : ''}
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {taxDocument.xmlFirmado && (
                  <a
                    href={`data:application/xml;charset=utf-8,${encodeURIComponent(taxDocument.xmlFirmado)}`}
                    download={`DTE_${taxDocument.numeroDisplay}.xml`}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Truck className="w-4 h-4" /> Descargar XML
                  </a>
                )}
                {taxDocument.status === 'CERTIFIED' && !taxDocument.cancelledById && (
                  <button
                    type="button"
                    onClick={() => setShowFelCancel(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                  >
                    <FileX2 className="w-4 h-4" /> Anular DTE (NCRE)
                  </button>
                )}
                {taxDocument.status === 'CANCELLED' && (
                  <span className="inline-flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700">
                    <FileX2 className="w-4 h-4" /> Documento anulado
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
              <p className="text-sm text-slate-500">
                Esta venta aún no tiene DTE certificado. Genera la factura electrónica para el SAT.
              </p>
              <button
                type="button"
                onClick={handleCertifyFel}
                disabled={certifyingFel}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50 active:scale-95 shadow-md shadow-emerald-600/20"
              >
                {certifyingFel ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Certificar FEL
              </button>
            </div>
          )}
        </div>
      )}

      {/* FEL Cancel modal */}
      {showFelCancel && taxDocument && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-rose-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                  <FileX2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Anular DTE</h3>
                  <p className="text-xs text-rose-600 font-medium">{taxDocument.numeroDisplay}</p>
                </div>
              </div>
              <button
                onClick={() => setShowFelCancel(false)}
                className="p-2 hover:bg-rose-100 rounded-xl text-slate-400 hover:text-rose-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Se emitirá una Nota de Crédito (NCRE) asociada al DTE original y se marcará el DTE como anulado en el SAT.
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motivo de anulación *</label>
                <textarea
                  value={felCancelMotivo}
                  onChange={(e) => setFelCancelMotivo(e.target.value)}
                  rows={3}
                  placeholder="Error de captura, devolución total, datos incorrectos..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-5 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                type="button"
                onClick={() => setShowFelCancel(false)}
                disabled={cancellingFel}
                className="flex-1 py-3 rounded-2xl text-slate-500 font-bold hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCancelFel}
                disabled={cancellingFel || !felCancelMotivo.trim()}
                className="flex-[1.4] py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cancellingFel ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileX2 className="w-4 h-4" />}
                Confirmar Anulación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Returns History */}
      {sale.returns.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
          <h2 className="font-bold text-red-700 mb-4 flex items-center gap-2"><Undo2 className="w-4 h-4" /> Historial de Devoluciones</h2>
          <div className="space-y-3">
            {sale.returns.map(ret => (
              <div key={ret.id} className="bg-red-50/50 rounded-xl p-4 border border-red-100">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-bold text-slate-800">Q{Number(ret.amount).toFixed(2)}</p>
                    <p className="text-xs text-slate-500 mt-1">{ret.reason}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{format(new Date(ret.createdAt), "dd/MM/yyyy HH:mm")}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${ret.stockAdded ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {ret.stockAdded ? 'Stock reincorporado' : 'Sin restock'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && sale && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">¿Anular Venta?</h3>
              <p className="text-slate-500 text-sm mt-2">
                Esta acción cancelará completamente la transacción. El stock de los productos será devuelto al inventario disponible.
              </p>
            </div>
            <div className="p-4 bg-slate-50 flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-200 transition"
                disabled={cancelling}
              >
                Cancelar
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {showReturnModal && sale && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:hidden">
          <form onSubmit={handleReturn} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-slate-100 flex flex-col">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Procesar Devolución</h3>
                <p className="text-xs uppercase tracking-widest font-bold text-slate-400 mt-1">Venta {sale.id.split('-')[0].toUpperCase()}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowReturnModal(false);
                  setReturnError('');
                }}
                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {returnError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm font-medium">
                  {returnError}
                </div>
              )}

              <div className="grid gap-3">
                {sale.items.map(item => {
                  const returned = item.returnItems?.reduce((a, r) => a + r.quantity, 0) || 0;
                  const maxReturnable = item.quantity - returned;
                  if (maxReturnable <= 0) return null;
                  return (
                    <div key={item.id} className="border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{item.product.name}</p>
                        {item.variant && <p className="text-xs text-slate-500">{item.variant.name}</p>}
                        <p className="text-[11px] text-slate-500 mt-1">
                          Vendido: {item.quantity} · Devuelto: {returned} · Disponible: {maxReturnable}
                        </p>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={maxReturnable}
                        step="1"
                        value={returnItems[item.id] ?? '0'}
                        onChange={(event) => setReturnItems((prev) => ({ ...prev, [item.id]: Math.min(Number(event.target.value), maxReturnable) }))}
                        className="w-24 text-center font-bold border border-slate-200 rounded-xl px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Método de reembolso</label>
                  <select
                    value={refundMethod}
                    onChange={(event) => setRefundMethod(event.target.value as 'CASH' | 'CARD' | 'TRANSFER')}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="CASH">Efectivo</option>
                    <option value="CARD">Tarjeta</option>
                    <option value="TRANSFER">Transferencia</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Referencia</label>
                  <input
                    type="text"
                    value={returnReference}
                    onChange={(event) => setReturnReference(event.target.value)}
                    placeholder="Voucher, transferencia, observación"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Razón</label>
                <textarea
                  required
                  value={returnReason}
                  onChange={(event) => setReturnReason(event.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 resize-none"
                  placeholder="Producto defectuoso, error de cobro, devolución voluntaria..."
                />
              </div>

              <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={returnStockAdded}
                  onChange={(event) => setReturnStockAdded(event.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <p className="font-medium text-slate-800 text-sm">Reingresar inventario</p>
                  <p className="text-xs text-slate-500">Desactívalo si el producto no vuelve al stock por daño o merma.</p>
                </div>
              </label>
            </div>

            <div className="px-6 py-5 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowReturnModal(false);
                  setReturnError('');
                }}
                className="flex-1 py-3 rounded-2xl text-slate-500 font-bold hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submittingReturn}
                className="flex-[1.4] py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submittingReturn ? <Loader2 className="w-5 h-5 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                Confirmar Devolución
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cancel Sale Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-red-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Anular Venta Completa</h3>
                  <p className="text-xs text-red-600 font-medium">Esta acción es irreversible</p>
                </div>
              </div>
              <button onClick={() => setShowCancelModal(false)} className="p-2 hover:bg-red-100 rounded-xl text-slate-400 hover:text-red-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Al anular esta venta, el sistema ejecutará las siguientes acciones automáticamente:
              </p>
              <ul className="text-xs font-medium text-slate-600 space-y-2 list-disc list-inside bg-slate-50 p-4 rounded-xl border border-slate-100">
                <li>Todo el inventario será retornado a la sucursal.</li>
                <li>Se generará un <strong>Egreso</strong> en la Tesorería/Banco respectivo.</li>
                <li>Si fue en efectivo, se restará del cuadre de la Caja Registradora actual.</li>
                <li>La factura quedará inactiva y dejará de sumar en los reportes.</li>
              </ul>
              <p className="text-sm font-bold text-slate-800 text-center mt-4">
                ¿Estás seguro de continuar?
              </p>
            </div>
            <div className="px-6 py-5 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-3 rounded-2xl text-slate-500 font-bold hover:bg-slate-200 transition"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-[1.4] py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cancelling ? <Loader2 className="w-5 h-5 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Sí, Anular Venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Modal */}
      {showTicket && <TicketModal saleId={saleId} onClose={() => setShowTicket(false)} />}
      
      {/* Delivery Note Modal */}
      {showDeliveryNote && sale && (
        <CreateDeliveryNoteModal 
          saleId={sale.id}
          customerName={sale.customer?.name}
          items={sale.items.map(i => ({ productId: i.productId, variantId: i.variant?.id || null, quantity: i.quantity }))}
          onClose={() => setShowDeliveryNote(false)}
        />
      )}
    </div>
  );
}

function InfoCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-400 mb-2">{icon}<span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div>
      <p className="text-sm font-bold text-slate-800">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}
