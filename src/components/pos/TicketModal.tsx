'use client';

import { useEffect, useState } from 'react';
import { X, Printer, Loader2 } from 'lucide-react';
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

  useEffect(() => {
    let active = true;

    async function loadSale() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/sales/${saleId}`);
        const data = await res.json();

        if (!active) return;

        setSale(data.sale);
        setSettings(data.settings);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadSale();

    return () => {
      active = false;
    };
  }, [saleId]);

  const totalRefunded = (sale?.returns || []).reduce((sum, item) => sum + Number(item.amount), 0);

  const handlePrint = () => {
    window.print();
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


    </div>
  );
}
