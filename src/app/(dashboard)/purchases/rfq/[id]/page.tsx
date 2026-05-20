'use client';

/**
 * Fase 22c-4 · Detalle de RFQ.
 *
 * - Header con estado, fechas, botones contextuales.
 * - Items (con badge adjudicado).
 * - Invitaciones.
 * - Matriz comparativa (QuotationMatrix).
 * - Botones de adjudicación (mejor por item, mejor global, manual).
 * - POs generadas (link a detalle).
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Loader2,
  Send,
  XCircle,
  Plus,
  FileText,
  Award,
  Mail,
  Store,
  ClipboardCheck,
  CheckCircle2,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { useToast } from '@/components/ui/toast';
import { RfqStatusBadge } from '@/components/purchases/RfqStatusBadge';
import {
  QuotationMatrix,
  type MatrixSupplier,
} from '@/components/purchases/QuotationMatrix';

interface RfqItem {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number | string;
  specifications: string | null;
  unit: string | null;
  observations: string | null;
  awardedSupplierId: string | null;
  awardedQuoteItemId: string | null;
  awardedAt: string | null;
  product: { id: string; name: string; sku: string; unitOfMeasure?: string | null };
  variant: { id: string; name: string; sku: string } | null;
  awardedSupplier: { id: string; name: string } | null;
  awardedQuoteItem: {
    id: string;
    unitPrice: number | string;
    quantity: number | string;
    deliveryDays: number | null;
    rfqQuoteId: string;
  } | null;
}

interface RfqInvitation {
  id: string;
  supplierId: string | null;
  externalEmail: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  declinedAt: string | null;
  notes: string | null;
  supplier: { id: string; name: string; email: string | null } | null;
}

interface RfqQuoteItem {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number | string;
  unitPrice: number | string;
  deliveryDays: number | null;
}

interface RfqQuote {
  id: string;
  supplierId: string;
  totalAmount: number | string;
  validUntil: string | null;
  notes: string | null;
  createdAt: string;
  supplier: { id: string; name: string; email: string | null };
  quotedBy: { id: string; name: string | null } | null;
  items: RfqQuoteItem[];
}

interface RfqGeneratedPO {
  id: string;
  reference: string | null;
  total: number | string;
  status: string;
  createdAt: string;
  supplier: { id: string; name: string };
}

interface RfqDetail {
  id: string;
  status: string;
  reason: string;
  reference: string | null;
  branchId: string;
  buyer: { id: string; name: string | null; email: string | null } | null;
  createdBy: { id: string; name: string | null; email: string | null };
  branch: { id: string; name: string; code: string };
  deliveryPlace: string | null;
  responseDeadline: string | null;
  quoteValidityDays: number | null;
  sentAt: string | null;
  closedAt: string | null;
  createdAt: string;
  items: RfqItem[];
  invitations: RfqInvitation[];
  quotes: RfqQuote[];
  generatedPurchaseOrders: RfqGeneratedPO[];
}

function formatQ(n: number | string): string {
  return `Q${Number(n).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type AwardSelection = Record<
  string,
  { supplierId: string; rfqQuoteItemId: string } | undefined
>;

export default function RfqDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [rfq, setRfq] = useState<RfqDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<AwardSelection>({});
  const [showAddInvitation, setShowAddInvitation] = useState(false);

  const fetchRfq = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/purchases/rfq/${id}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'No se pudo cargar la RFQ.');
      }
      setRfq(data);
      // Inicializar selection con awards existentes
      const init: AwardSelection = {};
      for (const it of (data as RfqDetail).items) {
        if (it.awardedSupplierId && it.awardedQuoteItemId) {
          init[it.id] = {
            supplierId: it.awardedSupplierId,
            rfqQuoteItemId: it.awardedQuoteItemId,
          };
        }
      }
      setSelection(init);
    } catch (err) {
      toast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Error al cargar RFQ.',
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void fetchRfq();
  }, [fetchRfq]);

  const matrixSuppliers: MatrixSupplier[] = useMemo(() => {
    if (!rfq) return [];
    return rfq.quotes.map((q) => ({
      id: q.supplierId,
      name: q.supplier.name,
      quoteId: q.id,
      totalAmount: Number(q.totalAmount),
      items: q.items.map((qi) => ({
        id: qi.id,
        productId: qi.productId,
        quantity: Number(qi.quantity),
        unitPrice: Number(qi.unitPrice),
        deliveryDays: qi.deliveryDays,
      })),
    }));
  }, [rfq]);

  const matrixItems = useMemo(() => {
    if (!rfq) return [];
    return rfq.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product.name,
      productSku: it.product.sku,
      quantity: Number(it.quantity),
      unit: it.unit ?? it.product.unitOfMeasure ?? null,
      awardedSupplierId: it.awardedSupplierId,
      awardedQuoteItemId: it.awardedQuoteItemId,
    }));
  }, [rfq]);

  const isDraft = rfq?.status === 'DRAFT';
  const isOpen = rfq?.status === 'SENT' || rfq?.status === 'OPEN';
  const isAwarded = rfq?.status === 'AWARDED';
  const isTerminal =
    rfq?.status === 'CANCELLED' || rfq?.status === 'CLOSED' || rfq?.status === 'AWARDED';

  // Acciones
  const send = async () => {
    if (!rfq) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/purchases/rfq/${rfq.id}/send`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Error enviando.');
      toast({ tone: 'success', message: 'RFQ enviada.' });
      await fetchRfq();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!rfq) return;
    if (!confirm('¿Cancelar esta RFQ?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/purchases/rfq/${rfq.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Error cancelando.');
      toast({ tone: 'success', message: 'RFQ cancelada.' });
      await fetchRfq();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const setBestPerItem = () => {
    if (!rfq) return;
    const next: AwardSelection = {};
    for (const it of rfq.items) {
      let best: { supplierId: string; quoteItemId: string; price: number } | null = null;
      for (const sup of matrixSuppliers) {
        const qi = sup.items.find((q) => q.productId === it.productId);
        if (!qi) continue;
        if (!best || qi.unitPrice < best.price) {
          best = { supplierId: sup.id, quoteItemId: qi.id, price: qi.unitPrice };
        }
      }
      if (best) {
        next[it.id] = { supplierId: best.supplierId, rfqQuoteItemId: best.quoteItemId };
      }
    }
    setSelection(next);
    toast({ tone: 'info', message: 'Mejor precio por item seleccionado.' });
  };

  const setBestGlobal = () => {
    if (!rfq || rfq.quotes.length === 0) return;
    // Proveedor con menor total
    let winner: RfqQuote | null = null;
    for (const q of rfq.quotes) {
      if (!winner || Number(q.totalAmount) < Number(winner.totalAmount)) {
        winner = q;
      }
    }
    if (!winner) return;
    const next: AwardSelection = {};
    for (const it of rfq.items) {
      const qi = winner.items.find((q) => q.productId === it.productId);
      if (qi) {
        next[it.id] = { supplierId: winner.supplierId, rfqQuoteItemId: qi.id };
      }
    }
    setSelection(next);
    toast({
      tone: 'info',
      message: `Adjudicación tentativa: ${winner.supplier.name} gana todo lo que cotizó.`,
    });
  };

  const applyAward = async () => {
    if (!rfq) return;
    const entries = Object.entries(selection).filter(([, v]) => v !== undefined) as Array<
      [string, { supplierId: string; rfqQuoteItemId: string }]
    >;
    if (entries.length === 0) {
      toast({ tone: 'error', message: 'Seleccioná al menos un item.' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/purchases/rfq/${rfq.id}/award-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: entries.map(([rfqRequestItemId, v]) => ({
            rfqRequestItemId,
            supplierId: v.supplierId,
            rfqQuoteItemId: v.rfqQuoteItemId,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Error adjudicando.');
      toast({
        tone: 'success',
        message: data.allItemsAwarded ? 'Adjudicación completa.' : 'Adjudicación parcial guardada.',
      });
      await fetchRfq();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const generatePO = async () => {
    if (!rfq) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/purchases/rfq/${rfq.id}/generate-po`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Error generando POs.');
      toast({
        tone: 'success',
        message: data.alreadyGenerated
          ? 'Las POs ya estaban generadas.'
          : `${data.purchaseOrders.length} PO(s) creadas.`,
      });
      await fetchRfq();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }
  if (!rfq) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>RFQ no encontrada.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Compras', href: '/purchases' },
          { label: 'RFQ', href: '/purchases/rfq' },
          { label: rfq.reference || `Borrador #${rfq.id.slice(0, 6).toUpperCase()}` },
        ]}
      />

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">
                {rfq.reference || `Borrador #${rfq.id.slice(0, 6).toUpperCase()}`}
              </h1>
              <RfqStatusBadge status={rfq.status} />
            </div>
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{rfq.reason}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isDraft && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={send}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-md disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar a proveedores
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancel}
                  className="px-4 py-2 bg-rose-50 text-rose-700 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Eliminar (cancelar)
                </button>
              </>
            )}
            {isOpen && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancel}
                  className="px-4 py-2 bg-rose-50 text-rose-700 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Cancelar RFQ
                </button>
              </>
            )}
            {(isOpen || isAwarded) && rfq.generatedPurchaseOrders.length === 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={generatePO}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-md disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Generar Órdenes de Compra
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-slate-100 text-sm">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Sucursal</p>
            <p className="font-bold">{rfq.branch.name}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Comprador</p>
            <p className="font-bold">{rfq.buyer?.name || rfq.createdBy.name || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Validez cotiz.</p>
            <p className="font-bold">{rfq.quoteValidityDays ?? 30} días</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Fecha límite</p>
            <p className="font-bold">
              {rfq.responseDeadline
                ? format(new Date(rfq.responseDeadline), 'dd/MM/yyyy')
                : '-'}
            </p>
          </div>
          {rfq.deliveryPlace && (
            <div className="col-span-2 md:col-span-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Lugar de entrega</p>
              <p className="text-sm">{rfq.deliveryPlace}</p>
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <section className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-blue-600" /> Items
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-bold">Producto</th>
                <th className="px-3 py-2 text-center font-bold">Cant.</th>
                <th className="px-3 py-2 text-left font-bold">Observaciones</th>
                <th className="px-3 py-2 text-left font-bold">Adjudicación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rfq.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2">
                    <p className="font-bold text-slate-800">{it.product.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {it.product.sku}
                      {it.specifications ? ` · ${it.specifications}` : ''}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {Number(it.quantity)} {it.unit || it.product.unitOfMeasure || ''}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">
                    {it.observations || '-'}
                  </td>
                  <td className="px-3 py-2">
                    {it.awardedSupplier && it.awardedQuoteItem ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        {it.awardedSupplier.name} · {formatQ(it.awardedQuoteItem.unitPrice)}
                      </span>
                    ) : (
                      <span className="text-slate-700 text-xs italic">Sin adjudicar</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Invitations */}
      <section className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" /> Invitaciones ({rfq.invitations.length})
          </h2>
          {(isDraft || isOpen) && (
            <button
              type="button"
              onClick={() => setShowAddInvitation(true)}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Agregar
            </button>
          )}
        </div>
        {rfq.invitations.length === 0 ? (
          <p className="text-sm text-slate-500 italic">Sin invitaciones aún.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rfq.invitations.map((inv) => (
              <li
                key={inv.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm flex items-center gap-2">
                    {inv.supplier ? (
                      <Store className="w-4 h-4 text-slate-500" />
                    ) : (
                      <Mail className="w-4 h-4 text-slate-500" />
                    )}
                    {inv.supplier ? inv.supplier.name : inv.externalEmail}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {inv.declinedAt
                      ? `Declinada ${format(new Date(inv.declinedAt), 'dd/MM/yy HH:mm')}`
                      : inv.respondedAt
                      ? `Respondida ${format(new Date(inv.respondedAt), 'dd/MM/yy HH:mm')}`
                      : inv.sentAt
                      ? `Enviada ${format(new Date(inv.sentAt), 'dd/MM/yy HH:mm')}`
                      : 'Pendiente de envío'}
                  </p>
                </div>
                <div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg border ${
                      inv.declinedAt
                        ? 'bg-rose-50 text-rose-700 border-rose-100'
                        : inv.respondedAt
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : inv.sentAt
                        ? 'bg-amber-50 text-amber-700 border-amber-100'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {inv.declinedAt
                      ? 'Declinada'
                      : inv.respondedAt
                      ? 'Respondida'
                      : inv.sentAt
                      ? 'Pendiente'
                      : 'Sin enviar'}
                  </span>
                  {isOpen && inv.supplier && !inv.respondedAt && !inv.declinedAt && (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/purchases/rfq/${rfq.id}/quote/${inv.supplier!.id}`,
                        )
                      }
                      className="ml-3 text-xs font-bold text-blue-600 hover:text-blue-700"
                    >
                      Registrar cotización
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {showAddInvitation && (
          <AddInvitationModal
            rfqId={rfq.id}
            existingSupplierIds={
              new Set(
                rfq.invitations
                  .map((i) => i.supplierId)
                  .filter((v): v is string => Boolean(v)),
              )
            }
            onClose={() => setShowAddInvitation(false)}
            onAdded={() => {
              setShowAddInvitation(false);
              void fetchRfq();
            }}
          />
        )}
      </section>

      {/* Matrix + Award Actions */}
      {(isOpen || isAwarded) && (
        <section className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Award className="w-5 h-5 text-blue-600" /> Matriz comparativa
            </h2>
          </div>
          <QuotationMatrix
            items={matrixItems}
            suppliers={matrixSuppliers}
            selection={selection}
            onSelectionChange={(itemId, next) =>
              setSelection((curr) => ({ ...curr, [itemId]: next }))
            }
            readOnly={isTerminal}
          />
          {isOpen && rfq.quotes.length > 0 && (
            <div className="flex flex-wrap gap-3 justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={setBestPerItem}
                className="px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                Mejor precio por item
              </button>
              <button
                type="button"
                onClick={setBestGlobal}
                className="px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                Mejor proveedor global
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={applyAward}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                Aplicar adjudicación
              </button>
            </div>
          )}
        </section>
      )}

      {/* POs generadas */}
      {rfq.generatedPurchaseOrders.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" /> Órdenes de Compra generadas
          </h2>
          <ul className="divide-y divide-slate-100">
            {rfq.generatedPurchaseOrders.map((po) => (
              <li key={po.id} className="py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{po.reference || `PO #${po.id.slice(0, 6)}`}</p>
                  <p className="text-[10px] text-slate-500">
                    {po.supplier.name} ·{' '}
                    {format(new Date(po.createdAt), "dd MMM yy", { locale: es })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">{formatQ(po.total)}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
                    {po.status}
                  </span>
                  <Link
                    href={`/purchases?focus=${po.id}`}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700"
                  >
                    Ver
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AddInvitationModal({
  rfqId,
  existingSupplierIds,
  onClose,
  onAdded,
}: {
  rfqId: string;
  existingSupplierIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [supplierId, setSupplierId] = useState('');
  const [externalEmail, setExternalEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((d) =>
        setSuppliers(
          (d.suppliers || []).map((s: { id: string; name: string }) => ({
            id: s.id,
            name: s.name,
          })),
        ),
      )
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!supplierId && !externalEmail.trim()) {
      toast({ tone: 'error', message: 'Indicá proveedor o email.' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/purchases/rfq/${rfqId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: supplierId || null,
          externalEmail: externalEmail.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Error');
      toast({ tone: 'success', message: 'Invitación agregada.' });
      onAdded();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Agregar invitación"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold">Agregar invitación</h3>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">
            Proveedor registrado
          </label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl outline-none text-sm"
          >
            <option value="">Ninguno</option>
            {suppliers
              .filter((s) => !existingSupplierIds.has(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>
        <div className="text-center text-xs text-slate-500 font-bold uppercase tracking-widest">
          o
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">
            Email externo
          </label>
          <input
            type="email"
            value={externalEmail}
            onChange={(e) => setExternalEmail(e.target.value)}
            placeholder="proveedor@correo.com"
            className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">
            Notas
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl outline-none text-sm resize-none"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
