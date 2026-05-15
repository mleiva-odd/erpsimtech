'use client';

/**
 * Fase 22c-4 · Captura de cotización para un proveedor específico.
 *
 * Form con unitPrice + deliveryDays por cada item del RFQ.
 * validUntil + notes generales. Total client-side.
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { useToast } from '@/components/ui/toast';

interface RfqItemLite {
  id: string;
  productId: string;
  quantity: number | string;
  unit: string | null;
  product: { id: string; name: string; sku: string; unitOfMeasure?: string | null };
}

interface RfqLite {
  id: string;
  reference: string | null;
  reason: string;
  status: string;
  quoteValidityDays: number | null;
  items: RfqItemLite[];
}

interface SupplierLite {
  id: string;
  name: string;
}

interface QuoteLineDraft {
  rfqRequestItemId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  deliveryDays: number;
}

function formatQ(n: number): string {
  return `Q${n.toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function CaptureQuotePage({
  params,
}: {
  params: Promise<{ id: string; supplierId: string }>;
}) {
  const { id: rfqId, supplierId } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [rfq, setRfq] = useState<RfqLite | null>(null);
  const [supplier, setSupplier] = useState<SupplierLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<QuoteLineDraft[]>([]);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rfqRes, supRes] = await Promise.all([
        fetch(`/api/purchases/rfq/${rfqId}`),
        fetch('/api/suppliers'),
      ]);
      const rfqData = await rfqRes.json();
      const supData = await supRes.json();
      if (!rfqRes.ok) throw new Error(rfqData?.error || 'No se pudo cargar RFQ.');
      if (!supRes.ok) throw new Error(supData?.error || 'No se pudo cargar proveedor.');
      const supplierMatch = (supData.suppliers || []).find(
        (s: { id: string; name: string }) => s.id === supplierId,
      );
      if (!supplierMatch) throw new Error('Proveedor no encontrado.');
      setRfq(rfqData);
      setSupplier({ id: supplierMatch.id, name: supplierMatch.name });
      setLines(
        (rfqData.items as RfqItemLite[]).map((it) => ({
          rfqRequestItemId: it.id,
          productName: it.product.name,
          productSku: it.product.sku,
          quantity: Number(it.quantity),
          unit: it.unit ?? it.product.unitOfMeasure ?? null,
          unitPrice: 0,
          deliveryDays: 0,
        })),
      );
      // Default validUntil = today + quoteValidityDays
      const days = rfqData.quoteValidityDays ?? 30;
      const d = new Date();
      d.setDate(d.getDate() + Number(days));
      setValidUntil(d.toISOString().slice(0, 10));
    } catch (err) {
      toast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Error',
      });
    } finally {
      setLoading(false);
    }
  }, [rfqId, supplierId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(
    () => lines.reduce((acc, l) => acc + l.quantity * (Number(l.unitPrice) || 0), 0),
    [lines],
  );

  const updateLine = (idx: number, patch: Partial<QuoteLineDraft>) => {
    setLines((curr) => curr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const submit = async () => {
    if (!rfq) return;
    if (lines.every((l) => !l.unitPrice || l.unitPrice <= 0)) {
      toast({ tone: 'error', message: 'Ingresá al menos un precio.' });
      return;
    }
    setBusy(true);
    try {
      const payloadItems = lines
        .filter((l) => l.unitPrice > 0)
        .map((l) => ({
          rfqRequestItemId: l.rfqRequestItemId,
          unitPrice: l.unitPrice,
          deliveryDays: l.deliveryDays || null,
        }));
      if (payloadItems.length === 0) {
        throw new Error('Debe haber al menos una línea con precio.');
      }
      const res = await fetch(`/api/purchases/rfq/${rfqId}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          validUntil: validUntil || null,
          notes: notes.trim() || null,
          items: payloadItems,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Error al guardar.');
      toast({ tone: 'success', message: 'Cotización registrada.' });
      router.push(`/purchases/rfq/${rfqId}`);
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
  if (!rfq || !supplier) {
    return <div className="p-8 text-slate-500">No se encontró la información.</div>;
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Compras', href: '/purchases' },
          { label: 'RFQ', href: '/purchases/rfq' },
          {
            label: rfq.reference || `Borrador #${rfq.id.slice(0, 6).toUpperCase()}`,
            href: `/purchases/rfq/${rfq.id}`,
          },
          { label: 'Cotización' },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Registrar cotización · {supplier.name}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {rfq.reference || `RFQ Borrador #${rfq.id.slice(0, 6)}`} · {rfq.reason}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
              Válida hasta
            </label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
              Notas
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Condiciones, descuentos, etc."
              className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl outline-none text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-bold">Producto</th>
                <th className="px-3 py-2 text-center font-bold">Cant.</th>
                <th className="px-3 py-2 text-center font-bold">Precio unit.</th>
                <th className="px-3 py-2 text-center font-bold">Días entrega</th>
                <th className="px-3 py-2 text-right font-bold">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, idx) => (
                <tr key={l.rfqRequestItemId}>
                  <td className="px-3 py-2">
                    <p className="font-bold">{l.productName}</p>
                    <p className="text-[10px] text-slate-500">{l.productSku}</p>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {l.quantity} {l.unit || ''}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={l.unitPrice}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        updateLine(idx, { unitPrice: Number.isFinite(v) ? v : 0 });
                      }}
                      className="w-28 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right"
                      aria-label={`Precio unitario ${l.productName}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="number"
                      min={0}
                      value={l.deliveryDays}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        updateLine(idx, { deliveryDays: Number.isFinite(v) ? v : 0 });
                      }}
                      className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right"
                      aria-label={`Días entrega ${l.productName}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-bold">
                    {formatQ(l.quantity * (Number(l.unitPrice) || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr>
                <td colSpan={4} className="px-3 py-3 text-right font-bold uppercase text-xs text-slate-500">
                  Total
                </td>
                <td className="px-3 py-3 text-right font-bold text-lg text-slate-900">
                  {formatQ(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => router.push(`/purchases/rfq/${rfqId}`)}
            className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-md disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar cotización
          </button>
        </div>
      </div>
    </div>
  );
}
