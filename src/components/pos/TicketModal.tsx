'use client';

import { useState, useEffect } from 'react';
import { X, Printer, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface TicketModalProps {
  saleId: string;
  onClose: () => void;
}

export function TicketModal({ saleId, onClose }: TicketModalProps) {
  const [sale, setSale] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sales/${saleId}`)
      .then(res => res.json())
      .then(data => {
        setSale(data.sale);
        setSettings(data.settings);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoading(false);
      });
  }, [saleId]);

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
  const paymentMethodLabel = (method: string) => {
    switch (method) {
      case 'CASH': return 'Efectivo';
      case 'CARD': return 'Tarjeta';
      case 'TRANSFER': return 'Transferencia';
      default: return method;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm print:bg-white print:backdrop-blur-none p-4">
      {/* Action buttons (hidden when printing) */}
      <div className="absolute top-4 right-4 flex gap-2 print:hidden">
        <button
          onClick={handlePrint}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-lg flex items-center gap-2 transition"
        >
          <Printer className="w-5 h-5" /> Imprimir Ticket
        </button>
        <button
          onClick={onClose}
          className="bg-slate-800 hover:bg-slate-900 text-white p-2 rounded-lg shadow-lg flex items-center gap-2 transition"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Ticket Container */}
      <div className="bg-white p-6 w-full max-w-[80mm] min-h-[50vh] shadow-xl text-black font-mono text-sm print:shadow-none print:w-[80mm] print:m-0 print:p-0">
        
        {/* Store Header */}
        <div className="text-center mb-6">
          <h2 className="font-bold text-xl uppercase mb-1">{storeName}</h2>
          <p className="text-xs">{address}</p>
          {nit && <p className="text-xs mt-1">NIT: {nit}</p>}
          {phone && <p className="text-xs">Tel: {phone}</p>}
        </div>

        {/* Sale Data */}
        <div className="border-b border-dashed border-slate-400 pb-3 mb-3 text-xs">
          <p className="flex justify-between">
            <span>Ticket:</span>
            <span>{sale.id.split('-')[0].toUpperCase()}</span>
          </p>
          <p className="flex justify-between">
            <span>Fecha:</span>
            <span>{format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm", { locale: es })}</span>
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

        {/* Customer Info */}
        <div className="border-b border-dashed border-slate-400 pb-3 mb-3 text-xs">
          <p className="font-bold mb-1">Cliente:</p>
          <p>{sale.customer ? sale.customer.name : 'Consumidor Final'}</p>
          {sale.customer?.nit && <p>NIT: {sale.customer.nit}</p>}
        </div>

        {/* Items */}
        <table className="w-full text-xs mb-4">
          <thead>
            <tr className="border-b border-dashed border-slate-400">
              <th className="text-left font-normal py-1">Cant</th>
              <th className="text-left font-normal py-1">Descripción</th>
              <th className="text-right font-normal py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item: any) => (
              <tr key={item.id}>
                <td className="py-1 align-top">{item.quantity}</td>
                <td className="py-1 align-top px-1">{item.product.name}</td>
                <td className="py-1 align-top text-right">{currencySymbol}{Number(item.subtotal).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
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

          {/* Payment(s) breakdown */}
          <div className="border-t border-dashed border-slate-400 mt-2 pt-2 space-y-1">
            {payments.length > 0 ? (
              payments.map((p: any, idx: number) => (
                <p key={idx} className="flex justify-between">
                  <span>{paymentMethodLabel(p.method)}:</span>
                  <span>{currencySymbol}{Number(p.amount).toFixed(2)}</span>
                </p>
              ))
            ) : (
              <p className="flex justify-between">
                <span>Método:</span>
                <span>N/A</span>
              </p>
            )}
            {payments.some((p: any) => p.reference) && (
              <div className="mt-1">
                {payments.filter((p: any) => p.reference).map((p: any, idx: number) => (
                  <p key={idx} className="text-[10px] text-slate-500">
                    Ref ({paymentMethodLabel(p.method)}): {p.reference}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Receipt footer */}
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
