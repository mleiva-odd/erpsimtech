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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border border-slate-100 animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Variantes Disponibles</h2>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em] mt-1">{product.name}</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Variants List */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4 custom-scrollbar bg-slate-50/30">
           {product.variants.map((variant) => {
              const stock = variant.stocks?.[0]?.quantity ?? 0;
              const outOfStock = stock <= 0;

              return (
                <button
                  key={variant.id}
                  onClick={() => onSelect(product, variant)}
                  className={`flex items-center justify-between p-5 border-2 rounded-[1.5rem] transition-all text-left group
                    ${outOfStock 
                      ? 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed' 
                      : 'bg-white border-slate-100 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/5 active:scale-[0.98] cursor-pointer'
                    }`}
                >
                  <div className="flex-1 pr-4 min-w-0">
                    <div className="font-bold text-slate-800 flex items-center gap-2.5 text-lg truncate">
                       <div className={`w-2 h-2 rounded-full ${outOfStock ? 'bg-slate-300' : 'bg-blue-500 animate-pulse'}`}></div>
                       {variant.name}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">
                       SKU: {variant.sku}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-bold text-2xl tracking-tighter ${outOfStock ? 'text-slate-400' : 'text-slate-900'}`}>
                      Q{Number(variant.price).toFixed(2)}
                    </div>
                    <div className={`text-[9px] font-bold px-2.5 py-1 mt-2 rounded-lg inline-block uppercase tracking-widest border
                      ${outOfStock ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                      {stock} EN STOCK
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
