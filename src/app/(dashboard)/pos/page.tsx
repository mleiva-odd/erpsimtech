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
import { ShoppingCart, Lock, Wallet, FileText, ReceiptText, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import Link from 'next/link';

export default function POSPage() {
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showRecentSalesModal, setShowRecentSalesModal] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showQuotesModal, setShowQuotesModal] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false);
  const itemCount = useCartStore((s) => s.itemCount());
  const { items, discount, customerId, totalWithDiscount, clearCart, ensureCheckoutRequestId } = useCartStore();
  const [isQuoting, setIsQuoting] = useState(false);
  const [taxRegime, setTaxRegime] = useState<'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null>(null);
  const [taxRegimeLoaded, setTaxRegimeLoaded] = useState(false);
  const { toast } = useToast();

  // Carga régimen tributario para mostrar IVA en cart + decidir si mostrar el banner.
  useEffect(() => {
    let active = true;
    fetch('/api/settings/company')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) {
          setTaxRegime(d.taxRegime ?? null);
          setTaxRegimeLoaded(true);
        }
      })
      .catch(() => {
        if (active) setTaxRegimeLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const taxRate = taxRegime === 'GENERAL' ? 0.12 : taxRegime === 'PEQUENO_CONTRIBUYENTE' ? 0.05 : 0;
  const subtotalAmount = items.reduce((a, i) => a + Number(i.subtotal), 0);
  const factor = subtotalAmount > 0 ? totalWithDiscount() / subtotalAmount : 1;
  const baseGravable = subtotalAmount * factor;
  const totalIva = Math.round(baseGravable * taxRate * 100) / 100;
  const totalConIva = Math.round((baseGravable + totalIva) * 100) / 100;

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const handleSuccess = (saleId: string) => {
    window.dispatchEvent(new Event('pos:inventory-changed'));
    setLastSaleId(saleId);
    setShowCheckout(false);
    setShowSuccess(true);
    setShowCartMobile(false);
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
    } catch (error) {
      toast({ tone: 'error', message: getErrorMessage(error, 'Error al crear cotización.') });
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

  const cobrarLabel = taxRate > 0 ? totalConIva : totalWithDiscount();

  return (
    <CashRegisterGuard>
      <div className="min-h-screen md:h-screen flex flex-col bg-slate-50 md:overflow-hidden">
        {/* Banner régimen no configurado */}
        {taxRegimeLoaded && !taxRegime && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-start sm:items-center gap-3 flex-wrap">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm font-medium text-amber-800 flex-1">
              Configura el régimen tributario en Settings antes de facturar. Sin él el IVA no se calculará.
            </p>
            <Link
              href="/settings"
              className="text-xs font-bold text-amber-800 underline hover:text-amber-900"
            >
              Ir a Configuración
            </Link>
          </div>
        )}

        <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
          {/* Panel izquierdo: catálogo */}
          <div className="flex-1 flex flex-col p-4 sm:p-6 gap-4 sm:gap-6 overflow-hidden min-h-0">
            <div className="flex items-center justify-between z-20 gap-3 flex-wrap">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Terminal de Venta</h1>
                <p className="hidden sm:block text-[13px] font-medium text-slate-500 mt-1">
                  Busca productos o escanea el código para el ticket
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowRecentSalesModal(true)}
                  className="bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors shadow-sm active:scale-95"
                  title="Ver ventas recientes y reimprimir tickets"
                >
                  <ReceiptText className="w-4 h-4" />
                  <span className="hidden sm:inline">Ventas</span>
                </button>
                <button
                  onClick={() => setShowQuotesModal(true)}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors shadow-sm active:scale-95"
                  title="Ver cotizaciones pendientes"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">Cotizaciones</span>
                </button>
                <button
                  onClick={() => setShowExpenseModal(true)}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors shadow-sm active:scale-95"
                  title="Registrar un Gasto o Retiro de Efectivo"
                >
                  <Wallet className="w-4 h-4" />
                  <span className="hidden sm:inline">Egreso</span>
                </button>
                <button
                  onClick={() => setShowCloseModal(true)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors shadow-sm active:scale-95"
                  title="Cerrar tu turno y bloquear el sistema"
                >
                  <Lock className="w-4 h-4" />
                  <span className="hidden sm:inline">Cerrar Caja</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 z-10">
              <div className="w-full sm:w-1/3">
                <CustomerSearch />
              </div>
              <div className="w-full sm:w-2/3">
                <ProductSearch />
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden mt-2 sm:mt-6 min-h-[18rem]">
              <ProductGrid />
            </div>

            {/* Mobile: trigger del carrito (sticky bottom) */}
            <div className="md:hidden -mx-4 sm:-mx-6 mt-2">
              <button
                type="button"
                onClick={() => setShowCartMobile(true)}
                disabled={itemCount === 0}
                className="w-full bg-blue-600 disabled:bg-slate-300 text-white font-bold py-4 flex items-center justify-center gap-3 active:scale-[0.98] transition"
                aria-label="Ver carrito"
              >
                <ShoppingCart className="w-5 h-5" />
                <span>
                  {itemCount > 0
                    ? `Ver carrito (${itemCount}) · Q${cobrarLabel.toFixed(2)}`
                    : 'Carrito vacío'}
                </span>
              </button>
            </div>
          </div>

          {/* Panel derecho: carrito (desktop) */}
          <div className="hidden md:flex w-96 border-l border-slate-100 bg-white flex-col p-6 shadow-xl shadow-slate-200/20">
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

            <div className="flex-1 overflow-hidden flex flex-col">
              <Cart />
            </div>

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
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl text-lg transition-all shadow-xl shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  Cobrar · Q{cobrarLabel.toFixed(2)}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Carrito mobile como modal full-screen */}
        {showCartMobile && (
          <div className="fixed inset-0 z-[70] md:hidden bg-white flex flex-col">
            <header className="h-16 border-b border-slate-200 flex items-center px-4 justify-between sticky top-0 bg-white z-10">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-blue-600" /> Carrito
              </h2>
              <button
                type="button"
                onClick={() => setShowCartMobile(false)}
                className="px-3 py-1.5 rounded-xl text-sm text-slate-500 hover:bg-slate-100"
              >
                Volver
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              <Cart />
            </div>
            {itemCount > 0 && (
              <div className="p-4 border-t border-slate-100 bg-white space-y-3">
                <button
                  onClick={handleCreateQuote}
                  disabled={isQuoting}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-sm active:scale-95 transition"
                >
                  {isQuoting ? 'Guardando...' : 'Generar Cotización'}
                </button>
                <button
                  onClick={() => setShowCheckout(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl text-lg active:scale-95 transition shadow-xl shadow-blue-500/20"
                >
                  Cobrar · Q{cobrarLabel.toFixed(2)}
                </button>
              </div>
            )}
          </div>
        )}

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

        {showQuotesModal && <QuotesModal onClose={() => setShowQuotesModal(false)} />}

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
