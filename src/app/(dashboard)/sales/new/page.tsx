'use client';

import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProductSearch } from '@/components/pos/ProductSearch';
import { CustomerSearch } from '@/components/pos/CustomerSearch';
import { QuotesModal } from '@/components/pos/QuotesModal';
import { Cart } from '@/components/pos/Cart';
import { CheckoutModal } from '@/components/pos/CheckoutModal';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { useCartStore } from '@/stores/cartStore';
import { ShoppingCart, FileText, Wifi, ArrowLeft, BookmarkPlus } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { TemplateSelector } from '@/components/templates/TemplateSelector';
import { SaveAsTemplateModal } from '@/components/templates/SaveAsTemplateModal';
import type { TemplateItem, TemplateMetadata } from '@/lib/templates/types';

export default function NewRemoteSalePage() {
  const router = useRouter();
  const [showCheckout, setShowCheckout] = useState(false);
  const [showQuotesModal, setShowQuotesModal] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false);

  const itemCount = useCartStore((s) => s.itemCount());
  const { items, discount, customerId, totalWithDiscount, clearCart, ensureCheckoutRequestId } = useCartStore();
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const [isQuoting, setIsQuoting] = useState(false);
  const [showSaveTpl, setShowSaveTpl] = useState(false);
  const { toast } = useToast();

  /**
   * Fase 22d-5 · Aplicar plantilla al cart store.
   *
   * Para cada productId del template, hacemos lookup contra
   * /api/products/[id] y empujamos al carrito con la quantity correcta.
   * Si el producto no existe o está fuera de stock, se omite.
   */
  const applyTemplate = useCallback(
    async (templateItems: TemplateItem[], _: TemplateMetadata | null) => {
      try {
        let added = 0;
        for (const it of templateItems) {
          const res = await fetch(`/api/products/${encodeURIComponent(it.productId)}`);
          if (!res.ok) continue;
          const p = await res.json().catch(() => null);
          if (!p?.id) continue;
          // Calcular stock disponible (suma de stocks en la sucursal/empresa).
          const stocks = Array.isArray(p.stocks) ? p.stocks : [];
          const stock = stocks.reduce(
            (acc: number, s: { quantity?: number | string | null }) =>
              acc + (Number(s?.quantity) || 0),
            0,
          );
          if (stock <= 0) continue;
          const desired = Math.min(
            Math.max(1, Math.floor(Number(it.quantity) || 1)),
            stock,
          );
          const unitPrice = Number(it.unitPrice ?? p.price ?? 0) || 0;
          addItem({
            id: p.id,
            name: p.name ?? '',
            sku: p.sku ?? '',
            price: unitPrice,
            stock,
          });
          if (desired > 1) {
            updateQuantity(p.id, desired);
          }
          added += 1;
        }
        if (added === 0) {
          toast({ tone: 'error', message: 'Ningún producto de la plantilla está disponible.' });
        } else {
          toast({ tone: 'success', message: `${added} ítem(s) agregados al carrito.` });
        }
      } catch (err) {
        toast({
          tone: 'error',
          message: err instanceof Error ? err.message : 'No se pudo aplicar la plantilla.',
        });
      }
    },
    [addItem, updateQuantity, toast],
  );

  const templateItemsPayload: TemplateItem[] = items.map((it) => ({
    productId: it.product.id,
    variantId: it.product.variantId ?? null,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
  }));

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const handleSuccess = (saleId: string) => {
    window.dispatchEvent(new Event('pos:inventory-changed'));
    setShowCheckout(false);
    setShowCartMobile(false);
    toast({ tone: 'success', message: 'Venta remota registrada con éxito' });
    router.push(`/sales/${saleId}`);
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
          channel: 'REMOTE',
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
      router.push('/sales');
    } catch (error) {
      toast({ tone: 'error', message: getErrorMessage(error, 'Error al crear cotización.') });
    } finally {
      setIsQuoting(false);
    }
  };

  useEffect(() => {
    // Clear cart on mount just in case there's leftover from POS
    clearCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen md:h-screen flex flex-col bg-slate-50 md:overflow-hidden">
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        <div className="flex-1 flex flex-col p-4 sm:p-6 gap-4 sm:gap-6 overflow-hidden min-h-0">
          <div className="flex items-center justify-between z-20 gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => router.push('/sales')} aria-label="Volver a Ventas" className="p-2 hover:bg-slate-200 rounded-xl transition shrink-0">
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Wifi className="w-5 h-5 text-purple-600" /> Nueva Venta Remota
                </h1>
                <p className="hidden sm:block text-[13px] font-medium text-slate-500 mt-1">Cotizar y vender sin dependencia de caja chica</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <TemplateSelector
                type="SALE"
                onApply={(tplItems, tplMeta) => {
                  void applyTemplate(tplItems, tplMeta);
                }}
                buttonLabel="Usar plantilla"
              />
              <button
                type="button"
                onClick={() => setShowSaveTpl(true)}
                disabled={items.length === 0}
                aria-label="Guardar como plantilla"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition disabled:opacity-50"
              >
                <BookmarkPlus className="w-3.5 h-3.5" /> Guardar como plantilla
              </button>
              <button
                onClick={() => setShowQuotesModal(true)}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors shadow-sm active:scale-95"
                title="Ver cotizaciones pendientes"
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Cotizaciones Pendientes</span>
                <span className="sm:hidden">Cotizaciones</span>
              </button>
              <div className="text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm min-w-[120px] text-center hidden md:block">
                {new Date().toLocaleDateString('es-GT', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()}
              </div>
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
              className="w-full bg-purple-600 disabled:bg-slate-300 text-white font-bold py-4 flex items-center justify-center gap-3 active:scale-[0.98] transition"
              aria-label="Ver carrito"
            >
              <ShoppingCart className="w-5 h-5" />
              <span>
                {itemCount > 0
                  ? `Ver carrito (${itemCount}) · Q${totalWithDiscount().toFixed(2)}`
                  : 'Carrito vacío'}
              </span>
            </button>
          </div>
        </div>

        {/* Panel derecho: carrito (desktop) */}
        <div className="hidden md:flex w-96 border-l border-slate-100 bg-white flex-col p-6 shadow-xl shadow-slate-200/20 z-10">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-50">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="font-bold text-slate-800 tracking-tight">Carrito de Venta</h2>
            {itemCount > 0 && (
              <span className="ml-auto bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase">
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
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-2xl text-lg transition-all shadow-xl shadow-purple-500/20 active:scale-95 flex items-center justify-center gap-2"
              >
                Procesar Venta · Q{totalWithDiscount().toFixed(2)}
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
              <ShoppingCart className="w-5 h-5 text-purple-600" /> Carrito
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
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-2xl text-lg active:scale-95 transition shadow-xl shadow-purple-500/20"
              >
                Procesar Venta · Q{totalWithDiscount().toFixed(2)}
              </button>
            </div>
          )}
        </div>
      )}

      {showCheckout && (
        <CheckoutModal
          onClose={() => setShowCheckout(false)}
          onSuccess={handleSuccess}
          channel="REMOTE"
        />
      )}

      {showQuotesModal && (
        <QuotesModal onClose={() => setShowQuotesModal(false)} />
      )}

      {showSaveTpl && (
        <SaveAsTemplateModal
          type="SALE"
          items={templateItemsPayload}
          metadata={null}
          onClose={() => setShowSaveTpl(false)}
        />
      )}
    </div>
  );
}
