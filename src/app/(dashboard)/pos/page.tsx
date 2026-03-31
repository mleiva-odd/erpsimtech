'use client';

import { useState } from 'react';
import { ProductSearch } from '@/components/pos/ProductSearch';
import { CustomerSearch } from '@/components/pos/CustomerSearch';
import { TicketModal } from '@/components/pos/TicketModal';
import { CashRegisterGuard } from '@/components/pos/CashRegisterGuard';
import { Cart } from '@/components/pos/Cart';
import { CheckoutModal } from '@/components/pos/CheckoutModal';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { useCartStore } from '@/stores/cartStore';
import { ShoppingCart, CheckCircle } from 'lucide-react';

export default function POSPage() {
  const [showCheckout, setShowCheckout] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const itemCount = useCartStore((s) => s.itemCount());
  const totalWithDiscount = useCartStore((s) => s.totalWithDiscount());

  const handleSuccess = (saleId: string) => {
    setLastSaleId(saleId);
    setShowCheckout(false);
    setShowSuccess(true);
  };

  return (
    <CashRegisterGuard>
      <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
              <h1 className="text-xl font-bold text-slate-800">Terminal de Venta</h1>
              <p className="text-sm text-slate-500">Busca o escanea un producto para agregarlo</p>
            </div>
            <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">
              {new Date().toLocaleDateString('es-GT', { weekday: 'long', day: '2-digit', month: 'long' })}
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

          <div className="flex-1 flex overflow-hidden mt-4">
            <ProductGrid />
          </div>
        </div>

        {/* Panel derecho: carrito */}
        <div className="w-96 border-l border-slate-200 bg-white flex flex-col p-4 shadow-inner">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingCart className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-slate-800">Carrito</h2>
            {itemCount > 0 && (
              <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {itemCount} ítem{itemCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Carrito */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <Cart />
          </div>

          {/* Botón de cobrar */}
          {itemCount > 0 && (
            <button
              onClick={() => setShowCheckout(true)}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl text-lg transition-colors shadow-lg shadow-blue-200 active:scale-95"
            >
              Cobrar · Q{totalWithDiscount.toFixed(2)}
            </button>
          )}
        </div>
      </div>

      {/* Modal de cobro */}
      {showCheckout && (
        <CheckoutModal
          onClose={() => setShowCheckout(false)}
          onSuccess={handleSuccess}
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
