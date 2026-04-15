'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Printer, Loader2, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface TicketModalProps {
  saleId: string;
  onClose: () => void;
}

interface SaleReturnItem {
  saleItemId: string;
  quantity: number;
}

interface SaleReturn {
  id: string;
  amount: number | string;
  createdAt: string;
  items: SaleReturnItem[];
}

interface SaleItem {
  id: string;
  quantity: number;
  subtotal: number | string;
  product: { name: string; sku?: string };
  variant?: { id: string; name: string; sku?: string } | null;
}

interface SaleData {
  id: string;
  total: number | string;
  discount: number | string;
  status: string;
  createdAt: string;
  user?: { name: string };
  customer?: { name: string; nit?: string | null } | null;
  branch?: { name: string } | null;
  items: SaleItem[];
  payments: Array<{ method: string; amount: number | string; reference?: string | null }>;
  returns: SaleReturn[];
}

interface SettingsData {
  storeName?: string;
  address?: string;
  phone?: string;
  nit?: string;
  receiptMsg?: string;
  currencySymbol?: string;
}

type RefundMethod = 'CASH' | 'CARD' | 'TRANSFER';

function paymentMethodLabel(method: string) {
  switch (method) {
    case 'CASH':
      return 'Efectivo';
    case 'CARD':
      return 'Tarjeta';
    case 'TRANSFER':
      return 'Transferencia';
    default:
      return method;
  }
}

export function TicketModal({ saleId, onClose }: TicketModalProps) {
  const [sale, setSale] = useState<SaleData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returnReference, setReturnReference] = useState('');
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('CASH');
  const [stockAdded, setStockAdded] = useState(true);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnError, setReturnError] = useState('');
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

  const fetchSale = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/sales/${saleId}`);
      const data = await res.json();
      setSale(data.sale);
      setSettings(data.settings);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSale();
  }, [saleId]);

  const returnedQuantities = useMemo(() => {
    const map: Record<string, number> = {};

    (sale?.returns || []).forEach((saleReturn) => {
      saleReturn.items.forEach((item) => {
        map[item.saleItemId] = (map[item.saleItemId] || 0) + item.quantity;
      });
    });

    return map;
  }, [sale]);

  const refundableItems = useMemo(() => {
    if (!sale) return [];

    return sale.items.map((item) => {
      const returned = returnedQuantities[item.id] || 0;
      const remaining = item.quantity - returned;
      return {
        ...item,
        returned,
        remaining,
      };
    });
  }, [sale, returnedQuantities]);

  const hasRefundableItems = refundableItems.some((item) => item.remaining > 0);
  const totalRefunded = (sale?.returns || []).reduce((sum, item) => sum + Number(item.amount), 0);

  const openReturnForm = () => {
    const initialQuantities = Object.fromEntries(
      refundableItems.map((item) => [item.id, '0'])
    );
    setReturnQuantities(initialQuantities);
    setReturnReason('');
    setReturnReference('');
    setRefundMethod('CASH');
    setStockAdded(true);
    setReturnError('');
    setShowReturnForm(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSubmitReturn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sale) return;

    const items = Object.entries(returnQuantities)
      .map(([saleItemId, quantity]) => ({ saleItemId, quantity: Number(quantity) }))
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      setReturnError('Selecciona al menos una cantidad a devolver.');
      return;
    }

    if (!returnReason.trim()) {
      setReturnError('Debes indicar la razón de la devolución.');
      return;
    }

    setIsSubmittingReturn(true);
    setReturnError('');

    try {
      const res = await fetch('/api/pos/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: sale.id,
          reason: returnReason.trim(),
          stockAdded,
          refundMethod,
          reference: returnReference.trim() || null,
          items,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setReturnError(data.error || 'No fue posible registrar la devolución.');
        return;
      }

      setShowReturnForm(false);
      await fetchSale();
    } catch (err) {
      setReturnError('Error de conexión al procesar la devolución.');
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!sale) return null;

  const storeName = settings?.storeName || 'Mi Empresa POS';
  const address = settings?.address || 'Ciudad';
  const phone = settings?.phone || '';
  const nit = settings?.nit || '';
  const receiptMsg = settings?.receiptMsg || '¡Gracias por su compra!';
  const currencySymbol = settings?.currencySymbol || 'Q';
  const payments = sale.payments || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm print:bg-white print:backdrop-blur-none p-4">
      <div className="absolute top-8 right-8 flex gap-4 print:hidden">
        {sale.status === 'COMPLETED' && hasRefundableItems && (
          <button
            onClick={openReturnForm}
            className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-3 rounded-2xl font-bold shadow-xl shadow-amber-500/20 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95 text-sm"
          >
            <RotateCcw className="w-4 h-4" /> Devolución
          </button>
        )}
        <button
          onClick={handlePrint}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3.5 rounded-2xl font-bold shadow-xl shadow-blue-500/20 flex items-center gap-2.5 transition-all hover:scale-[1.02] active:scale-95 text-sm"
        >
          <Printer className="w-5 h-5" /> Imprimir Ticket
        </button>
        <button
          onClick={onClose}
          className="bg-slate-900 hover:bg-black text-white p-3.5 rounded-2xl shadow-xl flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="bg-white p-6 w-full max-w-[80mm] min-h-[50vh] shadow-xl text-black font-mono text-sm print:shadow-none print:w-[80mm] print:m-0 print:p-0">
        <div className="text-center mb-6">
          <h2 className="font-bold text-xl uppercase mb-1">{storeName}</h2>
          <p className="text-xs">{address}</p>
          {nit && <p className="text-xs mt-1">NIT: {nit}</p>}
          {phone && <p className="text-xs">Tel: {phone}</p>}
        </div>

        <div className="border-b border-dashed border-slate-400 pb-3 mb-3 text-xs">
          <p className="flex justify-between">
            <span>Ticket:</span>
            <span>{sale.id.split('-')[0].toUpperCase()}</span>
          </p>
          <p className="flex justify-between">
            <span>Fecha:</span>
            <span>{format(new Date(sale.createdAt), 'dd/MM/yyyy HH:mm', { locale: es })}</span>
          </p>
          <p className="flex justify-between">
            <span>Atendido por:</span>
            <span className="truncate ml-2">{sale.user?.name}</span>
          </p>
          {sale.branch && (
            <p className="flex justify-between">
              <span>Sucursal:</span>
              <span className="truncate ml-2">{sale.branch.name}</span>
            </p>
          )}
        </div>

        <div className="border-b border-dashed border-slate-400 pb-3 mb-3 text-xs">
          <p className="font-bold mb-1">Cliente:</p>
          <p>{sale.customer ? sale.customer.name : 'Consumidor Final'}</p>
          {sale.customer?.nit && <p>NIT: {sale.customer.nit}</p>}
        </div>

        <table className="w-full text-xs mb-4">
          <thead>
            <tr className="border-b border-dashed border-slate-400">
              <th className="text-left font-normal py-1">Cant</th>
              <th className="text-left font-normal py-1">Descripción</th>
              <th className="text-right font-normal py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td className="py-1 align-top">{item.quantity}</td>
                <td className="py-1 align-top px-1">
                  <div>{item.product.name}</div>
                  {item.variant && (
                    <div className="text-[10px] text-slate-500 font-medium">
                      {item.variant.name}
                    </div>
                  )}
                </td>
                <td className="py-1 align-top text-right">{currencySymbol}{Number(item.subtotal).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-dashed border-slate-400 pt-3 text-xs space-y-1">
          {Number(sale.discount) > 0 && (
            <p className="flex justify-between text-slate-600">
              <span>Descuento aplicado:</span>
              <span>{Number(sale.discount)}%</span>
            </p>
          )}
          <p className="flex justify-between font-bold text-sm mt-2">
            <span>TOTAL:</span>
            <span>{currencySymbol}{Number(sale.total).toFixed(2)}</span>
          </p>

          <div className="border-t border-dashed border-slate-400 mt-2 pt-2 space-y-1">
            {payments.length > 0 ? (
              payments.map((payment, idx) => (
                <p key={idx} className="flex justify-between">
                  <span>{paymentMethodLabel(payment.method)}:</span>
                  <span>{currencySymbol}{Number(payment.amount).toFixed(2)}</span>
                </p>
              ))
            ) : (
              <p className="flex justify-between">
                <span>Método:</span>
                <span>N/A</span>
              </p>
            )}
            {payments.some((payment) => payment.reference) && (
              <div className="mt-1">
                {payments.filter((payment) => payment.reference).map((payment, idx) => (
                  <p key={idx} className="text-[10px] text-slate-500">
                    Ref ({paymentMethodLabel(payment.method)}): {payment.reference}
                  </p>
                ))}
              </div>
            )}
          </div>

          {(sale.returns || []).length > 0 && (
            <div className="border-t border-dashed border-slate-400 mt-2 pt-2 space-y-1">
              <p className="font-bold text-[11px] uppercase tracking-wider text-amber-700">Devoluciones registradas</p>
              {(sale.returns || []).map((saleReturn) => (
                <p key={saleReturn.id} className="flex justify-between text-[11px] text-slate-600">
                  <span>{format(new Date(saleReturn.createdAt), 'dd/MM HH:mm')}</span>
                  <span>-{currencySymbol}{Number(saleReturn.amount).toFixed(2)}</span>
                </p>
              ))}
              <p className="flex justify-between font-bold text-[11px] text-amber-700">
                <span>Total devuelto:</span>
                <span>{currencySymbol}{totalRefunded.toFixed(2)}</span>
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-xs">
          <p className="font-bold">{receiptMsg}</p>
          <p className="mt-1 text-[10px] text-slate-500">
            Este no es un comprobante fiscal.<br />
            Sistema POS por SIMTECH
          </p>
        </div>
      </div>

      {showReturnForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:hidden">
          <form onSubmit={handleSubmitReturn} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-slate-100 flex flex-col">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Procesar Devolución</h3>
                <p className="text-xs uppercase tracking-widest font-bold text-slate-400 mt-1">Venta {sale.id.split('-')[0].toUpperCase()}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowReturnForm(false)}
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
                {refundableItems.map((item) => (
                  <div key={item.id} className="border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{item.product.name}</p>
                      {item.variant && <p className="text-xs text-slate-500">{item.variant.name}</p>}
                      <p className="text-[11px] text-slate-500 mt-1">
                        Vendido: {item.quantity} · Devuelto: {item.returned} · Disponible: {item.remaining}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={item.remaining}
                      step="1"
                      disabled={item.remaining <= 0}
                      value={returnQuantities[item.id] ?? '0'}
                      onChange={(event) => setReturnQuantities((prev) => ({ ...prev, [item.id]: event.target.value }))}
                      className="w-24 text-center font-bold border border-slate-200 rounded-xl px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Método de reembolso</label>
                  <select
                    value={refundMethod}
                    onChange={(event) => setRefundMethod(event.target.value as RefundMethod)}
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
                  checked={stockAdded}
                  onChange={(event) => setStockAdded(event.target.checked)}
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
                onClick={() => setShowReturnForm(false)}
                className="flex-1 py-3 rounded-2xl text-slate-500 font-bold hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmittingReturn}
                className="flex-[1.4] py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmittingReturn ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Confirmar Devolución
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
