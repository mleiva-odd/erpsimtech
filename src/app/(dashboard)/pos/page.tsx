'use client';

import { useState, useEffect } from 'react';
import { ProductSearch } from '@/components/pos/ProductSearch';
import { CustomerSearch } from '@/components/pos/CustomerSearch';
import { QuotesModal } from '@/components/pos/QuotesModal';
import { RecentSalesModal } from '@/components/pos/RecentSalesModal';
import { TicketModal } from '@/components/pos/TicketModal';
import { CashRegisterGuard } from '@/components/pos/CashRegisterGuard';
import { Cart } from '@/components/pos/Cart';
import { CheckoutModal } from '@/components/pos/CheckoutModal';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { CloseRegisterModal } from '@/components/pos/CloseRegisterModal';
import { ExpenseModal } from '@/components/pos/ExpenseModal';
import { useCartStore } from '@/stores/cartStore';
import { ShoppingCart, Lock, Wallet, FileText, ReceiptText } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

export default function POSPage() {
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showRecentSalesModal, setShowRecentSalesModal] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showQuotesModal, setShowQuotesModal] = useState(false);
  const itemCount = useCartStore((s) => s.itemCount());
  const { items, discount, customerId, totalWithDiscount, clearCart, ensureCheckoutRequestId } = useCartStore();
  const [isQuoting, setIsQuoting] = useState(false);
  const { toast } = useToast();

  const handleSuccess = (saleId: string) => {
    window.dispatchEvent(new Event('pos:inventory-changed'));
    setLastSaleId(saleId);
    setShowCheckout(false);
    setShowSuccess(true);
  };

  const handleCreateQuote = async () => {
    if (!customerId) {
      toast({ tone: 'error', message: 'Selecciona un cliente registrado para crear una cotización.' });
      return;
    }

    setIsQuoting(true);
    try {
      const clientRequestId = ensureCheckoutRequestId();

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId,
          status: 'QUOTE',
          items: items.map((i) => ({
            productId: i.product.id,
            variantId: i.product.variantId || null,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          payments: [],
          discount,
          customerId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      clearCart();
      toast({
        tone: 'success',
        message: `Cotización guardada correctamente. ID: ${data.id.split('-')[0].toUpperCase()}`,
      });
    } catch (e: any) {
      toast({ tone: 'error', message: e.message || 'Error al crear cotización.' });
    } finally {
      setIsQuoting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Evitar que actúen si el modal de cierre de caja o de éxito están abiertos
      if (showCloseModal || showSuccess) return;

      if (e.key === 'F8') {
        e.preventDefault();
        if (useCartStore.getState().itemCount() > 0) {
          setShowCheckout(true);
        }
      } else if (e.key === 'F12') {
        e.preventDefault();
        useCartStore.getState().clearCart();
      } else if (e.key === 'F2') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="producto"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCloseModal, showSuccess]);

  return (
    <CashRegisterGuard>
      <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden">
            <div className="flex items-center justify-between z-20">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Terminal de Venta</h1>
                <p className="text-[13px] font-medium text-slate-500 mt-1">Busca productos o escanea el código para el ticket</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowRecentSalesModal(true)}
                  className="bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm active:scale-95"
                  title="Ver ventas recientes y reimprimir tickets"
                >
                  <ReceiptText className="w-4 h-4" />
                  Ventas
                </button>
                <button
                  onClick={() => setShowQuotesModal(true)}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm active:scale-95"
                  title="Ver cotizaciones pendientes"
                >
                  <FileText className="w-4 h-4" />
                  Cotizaciones
                </button>
                <button
                  onClick={() => setShowExpenseModal(true)}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm active:scale-95"
                  title="Registrar un Gasto o Retiro de Efectivo"
                >
                  <Wallet className="w-4 h-4" />
                  Egreso
                </button>
                <button 
                  onClick={() => setShowCloseModal(true)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm active:scale-95"
                  title="Cerrar tu turno y bloquear el sistema"
                >
                  <Lock className="w-4 h-4" />
                  Cerrar Caja
                </button>
                <div className="text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm min-w-[120px] text-center hidden sm:block">
                  {new Date().toLocaleDateString('es-GT', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()}
                </div>
              </div>
            </div>

          <div className="flex flex-col sm:flex-row gap-4 z-10">
            {/* Buscador de cliente (izq) y productos (der) */}
            <div className="w-full sm:w-1/3">
              <CustomerSearch />
            </div>
            <div className="w-full sm:w-2/3">
              <ProductSearch />
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden mt-6">
            <ProductGrid />
          </div>
        </div>

        {/* Panel derecho: carrito */}
        <div className="w-96 border-l border-slate-100 bg-white flex flex-col p-6 shadow-xl shadow-slate-200/20">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-50">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="font-bold text-slate-800 tracking-tight">Carrito de Venta</h2>
            {itemCount > 0 && (
              <span className="ml-auto bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase">
                {itemCount} Ítem{itemCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Carrito */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <Cart />
          </div>

          {/* Botón de cobrar / Cotizar */}
          {itemCount > 0 && (
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={handleCreateQuote}
                disabled={isQuoting}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold py-3.5 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 border border-slate-100 text-sm"
              >
                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                {isQuoting ? 'Guardando...' : 'Generar Cotización'}
              </button>
              <button
                onClick={() => setShowCheckout(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4.5 rounded-2xl text-lg transition-all shadow-xl shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2"
              >
                Cobrar · Q{totalWithDiscount().toFixed(2)}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal de cobro */}
      {showCloseModal && (
        <CloseRegisterModal 
          onClose={() => setShowCloseModal(false)}
          onSuccess={() => window.location.reload()} 
        />
      )}

      {showCheckout && (
        <CheckoutModal
          onClose={() => setShowCheckout(false)}
          onSuccess={handleSuccess}
        />
      )}

      {showQuotesModal && (
        <QuotesModal onClose={() => setShowQuotesModal(false)} />
      )}

      {showRecentSalesModal && (
        <RecentSalesModal
          onClose={() => setShowRecentSalesModal(false)}
          onSelectSale={(saleId) => {
            setShowRecentSalesModal(false);
            setLastSaleId(saleId);
            setShowSuccess(true);
          }}
        />
      )}

      {/* Modal Egresos */}
      {showExpenseModal && (
        <ExpenseModal 
          onClose={() => setShowExpenseModal(false)}
          onSuccess={() => {
            setShowExpenseModal(false);
            toast({
              tone: 'success',
              message: 'Egreso registrado correctamente y descontado de tu cierre.',
            });
          }}
        />
      )}

      {/* Modal de Ticket de Impresión */}
      {showSuccess && lastSaleId && (
        <TicketModal
          saleId={lastSaleId}
          onClose={() => {
            setShowSuccess(false);
            setLastSaleId(null);
          }}
        />
      )}
      </div>
    </CashRegisterGuard>
  );
}
