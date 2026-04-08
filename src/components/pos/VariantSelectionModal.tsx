'use client';

import { X, Tag } from 'lucide-react';

interface Variant {
  id: string;
  name: string;
  sku: string;
  price: string | number;
  stocks?: { quantity: number }[];
}

interface Product {
  id: string;
  name: string;
  sku: string;
  hasVariants?: boolean;
  variants?: Variant[];
}

interface Props {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onSelect: (product: Product, variant: Variant) => void;
}

export function VariantSelectionModal({ isOpen, product, onClose, onSelect }: Props) {
  if (!isOpen || !product || !product.variants) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
          <div>
             <h2 className="text-xl font-bold text-slate-800">Seleccionar Variante</h2>
             <p className="text-sm font-medium text-blue-600 mt-0.5">{product.name}</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Variants List */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 custom-scrollbar bg-slate-50/50">
           {product.variants.map((variant) => {
              const stock = variant.stocks?.[0]?.quantity ?? 0;
              const outOfStock = stock <= 0;

              return (
                <button
                  key={variant.id}
                  onClick={() => onSelect(product, variant)}
                  className={`flex items-center justify-between p-4 border rounded-xl transition-all text-left group
                    ${outOfStock 
                      ? 'bg-slate-50 border-slate-200 opacity-75 hover:border-slate-300' 
                      : 'bg-white border-slate-200 hover:border-blue-500 hover:shadow-md hover:ring-1 hover:ring-blue-500 cursor-pointer'
                    }`}
                >
                  <div>
                    <div className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                       <Tag className={`w-4 h-4 ${outOfStock ? 'text-slate-400' : 'text-blue-500'}`} />
                       {variant.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-mono">
                      REF: {variant.sku}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-black text-xl ${outOfStock ? 'text-slate-600' : 'text-blue-600'}`}>
                      Q{Number(variant.price).toFixed(2)}
                    </div>
                    <div className={`text-[11px] font-bold px-2 py-0.5 mt-1.5 rounded inline-block uppercase tracking-wider
                      ${outOfStock ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {stock} UNIDADES
                    </div>
                  </div>
                </button>
              )
           })}
        </div>
      </div>
    </div>
  );
}
