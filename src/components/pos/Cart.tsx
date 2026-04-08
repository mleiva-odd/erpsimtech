'use client';

import { Trash2, Plus, Minus, ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';

export function Cart() {
  const { items, discount, subtotal, totalWithDiscount, removeItem, updateQuantity, setDiscount } = useCartStore();

  const sub = subtotal();
  const total = totalWithDiscount();

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
        {items.map((item) => (
          <div
            key={`${item.product.id}-${item.product.variantId || 'base'}`}
            className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800 text-sm truncate">{item.product.name}</p>
              <p className="text-xs text-slate-600">
                Q{Number(item.unitPrice).toFixed(2)} c/u
              </p>
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
      <div className="border-t border-slate-200 pt-4 mt-4 space-y-3">
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
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
        </div>

        {discount > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Ahorro</span>
            <span>-Q{(sub - total).toFixed(2)}</span>
          </div>
        )}

        <div className="flex justify-between items-center font-bold text-lg border-t border-slate-200 pt-3">
          <span className="text-slate-800">TOTAL</span>
          <span className="text-blue-600">Q{total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
