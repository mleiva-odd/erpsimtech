'use client';

import { useEffect, useRef, useState } from 'react';
import { X, CreditCard, Banknote, ArrowLeftRight, Loader2, CheckCircle, UserCircle, Plus, Trash2 } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';

interface CheckoutModalProps {
  onClose: () => void;
  onSuccess: (saleId: string) => void;
}

type PaymentMethodType = 'CASH' | 'CARD' | 'TRANSFER' | 'CREDIT';

interface PaymentEntry {
  method: PaymentMethodType;
  amount: number;
  reference: string;
}

interface PaymentSettings {
  acceptsCash: boolean;
  acceptsCard: boolean;
  acceptsTransfer: boolean;
  acceptsCredit: boolean;
}

const METHODS: { value: PaymentMethodType; label: string; icon: React.ReactNode }[] = [
  { value: 'CASH', label: 'Efectivo', icon: <Banknote className="w-4 h-4" /> },
  { value: 'CARD', label: 'Tarjeta', icon: <CreditCard className="w-4 h-4" /> },
  { value: 'TRANSFER', label: 'Transferencia', icon: <ArrowLeftRight className="w-4 h-4" /> },
  { value: 'CREDIT', label: 'Crédito', icon: <UserCircle className="w-4 h-4" /> },
];

export function CheckoutModal({ onClose, onSuccess }: CheckoutModalProps) {
  const {
    items, discount, customerId,
    totalWithDiscount, clearCart, ensureCheckoutRequestId,
  } = useCartStore();

  const total = totalWithDiscount();
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({
    acceptsCash: true,
    acceptsCard: true,
    acceptsTransfer: true,
    acceptsCredit: false,
  });
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { method: 'CASH', amount: total, reference: '' },
  ]);
  const [cashReceived, setCashReceived] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const enabledMethods = METHODS.filter((method) => {
    if (method.value === 'CASH') return paymentSettings.acceptsCash;
    if (method.value === 'CARD') return paymentSettings.acceptsCard;
    if (method.value === 'TRANSFER') return paymentSettings.acceptsTransfer;
    return paymentSettings.acceptsCredit;
  });

  useEffect(() => {
    let cancelled = false;

    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.error) return;

        const nextSettings: PaymentSettings = {
          acceptsCash: data.acceptsCash ?? true,
          acceptsCard: data.acceptsCard ?? true,
          acceptsTransfer: data.acceptsTransfer ?? true,
          acceptsCredit: data.acceptsCredit ?? false,
        };

        setPaymentSettings(nextSettings);
        setPayments((prev) => {
          const allowedMethods = METHODS.filter((method) => {
            if (method.value === 'CASH') return nextSettings.acceptsCash;
            if (method.value === 'CARD') return nextSettings.acceptsCard;
            if (method.value === 'TRANSFER') return nextSettings.acceptsTransfer;
            return nextSettings.acceptsCredit;
          }).map((method) => method.value);

          if (allowedMethods.length === 0) {
            return [];
          }

          const filtered = prev.filter((payment) => allowedMethods.includes(payment.method));
          if (filtered.length > 0) {
            return filtered;
          }

          return [{ method: allowedMethods[0], amount: total, reference: '' }];
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [total]);

  useEffect(() => {
    if (!error) return;
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [error]);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, total - totalPaid);
  const hasCash = payments.some(p => p.method === 'CASH');
  const change = hasCash ? Math.max(0, cashReceived - payments.find(p => p.method === 'CASH')!.amount) : 0;

  const updatePayment = (index: number, field: keyof PaymentEntry, value: any) => {
    setPayments(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const addPayment = () => {
    const fallbackMethod = enabledMethods.find((method) => method.value !== payments[0]?.method) || enabledMethods[0];
    if (!fallbackMethod) {
      setError('No hay métodos de pago habilitados en la configuración del negocio.');
      return;
    }
    setPayments(prev => [...prev, { method: fallbackMethod.value, amount: remaining, reference: '' }]);
  };

  const removePayment = (index: number) => {
    if (payments.length <= 1) return;
    setPayments(prev => prev.filter((_, i) => i !== index));
  };

  const handleCheckout = async () => {
    if (enabledMethods.length === 0) {
      setError('No hay métodos de pago habilitados para esta terminal.');
      return;
    }

    if (payments.some(p => p.method === 'CREDIT') && !customerId) {
       setError("Para vender al crédito debes seleccionar un Cliente registrado.");
       return;
    }

    if (totalPaid < total) {
      setError(`Pago insuficiente. Faltan Q${remaining.toFixed(2)}`);
      return;
    }

    // Validation: Require reference for CARD or TRANSFER
    const missingRef = payments.find(p => (p.method === 'CARD' || p.method === 'TRANSFER') && !p.reference.trim());
    if (missingRef) {
      setError(
        missingRef.method === 'CARD' 
          ? 'Debes ingresar el Número de Autorización (Voucher) para el pago con Tarjeta.' 
          : 'Debes ingresar el Número de Referencia para la Transferencia.'
      );
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const clientRequestId = ensureCheckoutRequestId();

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId,
          items: items.map((i) => ({
            productId: i.product.id,
            variantId: i.product.variantId || null,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          payments: payments.map(p => ({
            method: p.method,
            amount: p.amount,
            reference: p.reference || null,
          })),
          discount,
          customerId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al procesar la venta');
        return;
      }

      clearCart();
      onSuccess(data.id);
    } catch (e) {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] flex flex-col border border-slate-100 animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Finalizar Venta</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gestión de Cobro y Medios de Pago</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mb-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div ref={contentRef} className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

          {/* Total */}
          <div className="bg-blue-600 rounded-3xl p-6 text-center shadow-xl shadow-blue-500/20">
            <p className="text-xs text-blue-100 font-bold uppercase tracking-widest opacity-80">Total a liquidar</p>
            <p className="text-5xl font-bold text-white mt-2 tracking-tighter">Q{total.toFixed(2)}</p>
          </div>

          {/* Payments */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700">Pagos</p>
              {payments.length < 3 && enabledMethods.length > 1 && (
                <button
                  onClick={addPayment}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Pago mixto
                </button>
              )}
            </div>

            <div className="space-y-3">
              {payments.map((payment, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <div className="grid grid-cols-[1fr_auto] items-start gap-2">
                    {/* Method selector */}
                    <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-lg border border-slate-200 sm:grid-cols-4">
                      {METHODS.map((m) => (
                        <button
                          key={m.value}
                          onClick={() => updatePayment(idx, 'method', m.value)}
                          disabled={!enabledMethods.some((method) => method.value === m.value)}
                          className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-bold transition-all ${
                            payment.method === m.value
                              ? m.value === 'CARD' 
                                ? 'bg-slate-800 text-white shadow-md' // Premium look for CARD
                                : m.value === 'TRANSFER'
                                    ? 'bg-purple-600 text-white shadow-md'
                                  : m.value === 'CREDIT'
                                    ? 'bg-amber-600 text-white shadow-md'
                                    : 'bg-green-600 text-white shadow-md'
                              : 'text-slate-500 hover:bg-slate-50'
                          } ${
                            enabledMethods.some((method) => method.value === m.value) ? '' : 'opacity-30 cursor-not-allowed'
                          }`}
                        >
                          {m.icon}
                          {m.label}
                        </button>
                      ))}
                    </div>
                    {payments.length > 1 && (
                      <button
                        onClick={() => removePayment(idx)}
                        className="mt-1 p-2 text-slate-600 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        aria-label="Eliminar método de pago"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Amount and Ref split */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-widest mb-1 px-1">Abono Q.</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={payment.amount || ''}
                        onChange={(e) => updatePayment(idx, 'amount', Number(e.target.value))}
                        placeholder="Monto"
                        className="w-full text-right text-lg font-bold text-slate-700 bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2.5 outline-none transition"
                      />
                    </div>

                    {/* Reference for card/transfer */}
                    {payment.method !== 'CASH' && (
                      <div className="flex-1">
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-widest mb-1 px-1 flex items-center justify-between">
                          {payment.method === 'CARD'
                            ? 'Autorización'
                            : payment.method === 'TRANSFER'
                              ? 'No. Referencia'
                              : 'Referencia interna'}
                          {payment.method !== 'CREDIT' && <span className="text-red-400">*</span>}
                        </label>
                        <input
                          type="text"
                          value={payment.reference}
                          onChange={(e) => updatePayment(idx, 'reference', e.target.value)}
                          placeholder={
                            payment.method === 'CARD'
                              ? 'Ej: 123456'
                              : payment.method === 'TRANSFER'
                                ? 'Ej: 000987'
                                : 'Opcional: crédito a 15 días'
                          }
                          className={`w-full text-sm font-medium bg-white border focus:ring-2 rounded-xl px-3 py-3 outline-none transition ${
                            payment.method === 'CARD' 
                              ? 'border-slate-300 focus:border-slate-800 focus:ring-slate-200 text-slate-800' 
                              : payment.method === 'TRANSFER'
                                ? 'border-purple-200 focus:border-purple-500 focus:ring-purple-100 text-purple-700'
                                : 'border-amber-200 focus:border-amber-500 focus:ring-amber-100 text-amber-700'
                          }`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-3 text-sm space-y-1">
              <div className="flex justify-between text-slate-500">
                <span>Total pagado:</span>
                <span className={`font-medium ${totalPaid >= total ? 'text-green-600' : 'text-red-500'}`}>
                  Q{totalPaid.toFixed(2)}
                </span>
              </div>
              {remaining > 0 && (
                <div className="flex justify-between text-red-500 font-medium">
                  <span>Faltante:</span>
                  <span>Q{remaining.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Cash received (only if any payment is CASH) */}
          {hasCash && (
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-2">
                Efectivo Recibido
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={cashReceived || ''}
                onChange={(e) => setCashReceived(Number(e.target.value))}
                placeholder="Efectivo entregado por el cliente"
                className="w-full text-right text-2xl font-bold border-2 border-slate-200 focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-colors"
              />
              {cashReceived > 0 && change > 0 && (
                <div className="mt-2 flex justify-between items-center bg-green-50 rounded-lg px-4 py-2">
                  <span className="text-sm text-green-700 font-medium">Cambio</span>
                  <span className="text-xl font-bold text-green-600">Q{change.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-slate-100 bg-slate-50/50 flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-all text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleCheckout}
            disabled={isLoading || totalPaid < total}
            className="flex-[1.5] py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-500/20 hover:bg-blue-700 hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5 text-sm"
          >
            {isLoading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Procesando...</>
            ) : (
              <><CheckCircle className="w-5 h-5" /> Confirmar Cobro</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
