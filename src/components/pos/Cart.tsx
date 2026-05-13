'use client';

import { Trash2, Plus, Minus, ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useEffect, useState } from 'react';

interface CompanyTaxInfo {
  taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null;
}

/**
 * Fase 22a · Cart con IVA visible.
 *
 * Lee el régimen tributario de la empresa de `/api/settings/company` y
 * calcula IVA por línea según las reglas del archivo `src/lib/fel/tax-calc.ts`:
 *   - GENERAL → 12%
 *   - PEQUENO_CONTRIBUYENTE → 5%
 *   - taxRegime null → 0% (la UI muestra el aviso de configurar en Settings)
 *
 * La UI muestra IVA por línea y un breakdown Subtotal / Descuento / IVA / Total.
 */
export function Cart() {
  const { items, discount, subtotal, totalWithDiscount, removeItem, updateQuantity, setDiscount } = useCartStore();
  const [taxRegime, setTaxRegime] = useState<CompanyTaxInfo['taxRegime']>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/settings/company')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setTaxRegime(d.taxRegime ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const sub = subtotal();
  const total = totalWithDiscount();
  const descuentoMonto = sub - total;
  const taxRate = taxRegime === 'GENERAL' ? 0.12 : taxRegime === 'PEQUENO_CONTRIBUYENTE' ? 0.05 : 0;

  // Calcular IVA por línea (sobre subtotal post-descuento proporcional).
  // El descuento global se aplica % igual a cada línea. IVA = (subtotal-line * (1-disc%)) * taxRate.
  const factor = sub > 0 ? total / sub : 1;
  const itemsWithTax = items.map((item) => {
    const baseGravable = Number(item.subtotal) * factor;
    const tax = Math.round(baseGravable * taxRate * 100) / 100;
    return { ...item, baseGravable, tax };
  });
  const totalIva = Math.round(itemsWithTax.reduce((a, b) => a + b.tax, 0) * 100) / 100;
  const totalConIva = Math.round((total + totalIva) * 100) / 100;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-3 py-16">
        <ShoppingCart className="w-16 h-16 opacity-30" />
        <p className="text-sm font-medium">El carrito está vacío</p>
        <p className="text-xs text-slate-600">Busca un producto o escanea un código de barras</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Lista de ítems */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {itemsWithTax.map((item) => (
          <div
            key={`${item.product.id}-${item.product.variantId || 'base'}`}
            className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800 text-sm truncate">{item.product.name}</p>
              <p className="text-xs text-slate-600">
                Q{Number(item.unitPrice).toFixed(2)} c/u
              </p>
              {taxRate > 0 && item.tax > 0 && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  IVA ({(taxRate * 100).toFixed(0)}%): Q{item.tax.toFixed(2)}
                </p>
              )}
            </div>

            {/* Controles de cantidad */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.product.variantId)}
                className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors"
                aria-label="Disminuir"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-8 text-center font-bold text-sm text-slate-700">
                {item.quantity}
              </span>
              <button
                onClick={() => updateQuantity(item.product.id, item.quantity + 1, item.product.variantId)}
                disabled={item.quantity >= item.product.stock}
                className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-green-50 hover:border-green-300 hover:text-green-600 transition-colors disabled:opacity-30"
                aria-label="Aumentar"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            <div className="text-right w-20">
              <p className="font-semibold text-slate-800 text-sm">
                Q{Number(item.subtotal).toFixed(2)}
              </p>
            </div>

            <button
              onClick={() => removeItem(item.product.id, item.product.variantId)}
              className="text-slate-300 hover:text-red-500 transition-colors"
              aria-label="Eliminar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Totales y descuento */}
      <div className="border-t border-slate-200 pt-4 mt-4 space-y-2">
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Subtotal</span>
          <span className="font-medium">Q{sub.toFixed(2)}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Descuento</span>
          <div className="flex items-center gap-1 ml-auto">
            <input
              type="number"
              min={0}
              max={100}
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="w-16 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              aria-label="Porcentaje de descuento"
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
        </div>

        {descuentoMonto > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Ahorro</span>
            <span>-Q{descuentoMonto.toFixed(2)}</span>
          </div>
        )}

        {taxRate > 0 ? (
          <>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Base gravable</span>
              <span className="font-medium">Q{total.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>IVA ({(taxRate * 100).toFixed(0)}%)</span>
              <span className="font-medium">Q{totalIva.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center font-bold text-lg border-t border-slate-200 pt-3">
              <span className="text-slate-800">TOTAL A PAGAR</span>
              <span className="text-blue-600">Q{totalConIva.toFixed(2)}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between items-center font-bold text-lg border-t border-slate-200 pt-3">
            <span className="text-slate-800">TOTAL</span>
            <span className="text-blue-600">Q{total.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
