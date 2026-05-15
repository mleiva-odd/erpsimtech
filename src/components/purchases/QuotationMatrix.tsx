'use client';

/**
 * Fase 22c-4 · QuotationMatrix
 *
 * Matriz comparativa items × proveedores:
 *  - filas: items del RFQ
 *  - columnas: proveedores que cotizaron
 *  - cada celda: precio unitario + lead time
 *  - resalta verde la celda con mejor precio por item
 *  - última fila: total por proveedor
 *  - selector por item con dropdown del proveedor adjudicado
 */

import { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MatrixItem {
  id: string;
  productName: string;
  productSku: string;
  quantity: number;
  unit?: string | null;
  awardedSupplierId?: string | null;
  awardedQuoteItemId?: string | null;
}

export interface MatrixQuoteItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  deliveryDays: number | null;
}

export interface MatrixSupplier {
  id: string;
  name: string;
  quoteId: string;
  totalAmount: number;
  items: MatrixQuoteItem[];
}

interface QuotationMatrixProps {
  /** RFQ Items (filas). Deben venir con `id` del RFQRequestItem y productId/productName. */
  items: Array<MatrixItem & { productId: string }>;
  suppliers: MatrixSupplier[];
  /** Selección actual por rfqRequestItemId → { supplierId, rfqQuoteItemId }. Controlado. */
  selection: Record<string, { supplierId: string; rfqQuoteItemId: string } | undefined>;
  onSelectionChange?: (
    rfqRequestItemId: string,
    next: { supplierId: string; rfqQuoteItemId: string } | undefined,
  ) => void;
  readOnly?: boolean;
}

function formatQ(n: number): string {
  return `Q${n.toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function QuotationMatrix({
  items,
  suppliers,
  selection,
  onSelectionChange,
  readOnly = false,
}: QuotationMatrixProps) {
  // Por cada item, calcular qué proveedor tiene el mejor precio
  const bestBySupplier = useMemo(() => {
    const map = new Map<string, { supplierId: string; quoteItemId: string; price: number }>();
    for (const it of items) {
      let best: { supplierId: string; quoteItemId: string; price: number } | null = null;
      for (const sup of suppliers) {
        const qi = sup.items.find((q) => q.productId === it.productId);
        if (!qi) continue;
        if (!best || qi.unitPrice < best.price) {
          best = { supplierId: sup.id, quoteItemId: qi.id, price: qi.unitPrice };
        }
      }
      if (best) map.set(it.id, best);
    }
    return map;
  }, [items, suppliers]);

  if (suppliers.length === 0) {
    return (
      <div className="bg-slate-50 rounded-xl p-8 text-center text-sm text-slate-400 italic">
        Aún no hay cotizaciones recibidas.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white border border-slate-100 rounded-xl">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-bold sticky left-0 bg-slate-50 z-10">
              Producto
            </th>
            <th className="px-3 py-2 text-center font-bold">Cant.</th>
            {suppliers.map((sup) => (
              <th key={sup.id} className="px-3 py-2 text-center font-bold">
                {sup.name}
              </th>
            ))}
            {!readOnly && (
              <th className="px-3 py-2 text-left font-bold">Adjudicar a</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((it) => {
            const best = bestBySupplier.get(it.id);
            const currentSel = selection[it.id];
            return (
              <tr key={it.id} className="hover:bg-slate-50/40">
                <td className="px-3 py-2 sticky left-0 bg-white z-10">
                  <p className="font-bold text-slate-800">{it.productName}</p>
                  <p className="text-[10px] text-slate-400">{it.productSku}</p>
                </td>
                <td className="px-3 py-2 text-center text-slate-600">
                  {it.quantity} {it.unit || ''}
                </td>
                {suppliers.map((sup) => {
                  const qi = sup.items.find((q) => q.productId === it.productId);
                  if (!qi) {
                    return (
                      <td
                        key={sup.id}
                        className="px-3 py-2 text-center text-slate-300 italic"
                      >
                        —
                      </td>
                    );
                  }
                  const isBest = best?.quoteItemId === qi.id;
                  const isSelected =
                    currentSel?.supplierId === sup.id &&
                    currentSel.rfqQuoteItemId === qi.id;
                  return (
                    <td
                      key={sup.id}
                      className={cn(
                        'px-3 py-2 text-center',
                        isBest && 'bg-emerald-50',
                        isSelected && 'ring-2 ring-blue-400 ring-inset',
                      )}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span
                          className={cn(
                            'font-bold',
                            isBest ? 'text-emerald-700' : 'text-slate-700',
                          )}
                        >
                          {formatQ(qi.unitPrice)}
                        </span>
                        {qi.deliveryDays != null && (
                          <span className="text-[10px] text-slate-400">
                            {qi.deliveryDays}d
                          </span>
                        )}
                        {isBest && (
                          <span className="text-[9px] font-bold text-emerald-700 uppercase">
                            Mejor
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
                {!readOnly && (
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Adjudicar ${it.productName}`}
                      value={currentSel ? `${currentSel.supplierId}|${currentSel.rfqQuoteItemId}` : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          onSelectionChange?.(it.id, undefined);
                          return;
                        }
                        const [supplierId, rfqQuoteItemId] = val.split('|');
                        onSelectionChange?.(it.id, { supplierId, rfqQuoteItemId });
                      }}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Sin adjudicar</option>
                      {suppliers.map((sup) => {
                        const qi = sup.items.find((q) => q.productId === it.productId);
                        if (!qi) return null;
                        return (
                          <option
                            key={sup.id}
                            value={`${sup.id}|${qi.id}`}
                          >
                            {sup.name} · {formatQ(qi.unitPrice)}
                          </option>
                        );
                      })}
                    </select>
                  </td>
                )}
              </tr>
            );
          })}
          <tr className="bg-slate-50 font-bold text-slate-700">
            <td className="px-3 py-2 sticky left-0 bg-slate-50 z-10" colSpan={2}>
              Total cotizado
            </td>
            {suppliers.map((sup) => (
              <td key={sup.id} className="px-3 py-2 text-center">
                {formatQ(sup.totalAmount)}
              </td>
            ))}
            {!readOnly && (
              <td className="px-3 py-2 text-center">
                <CheckCircle2 className="w-4 h-4 text-slate-300 inline" aria-hidden="true" />
              </td>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
