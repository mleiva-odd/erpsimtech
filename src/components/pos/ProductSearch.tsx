'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useCartStore, CartProduct } from '@/stores/cartStore';
import { useDebounce } from '@/hooks/useDebounce';
import { VariantSelectionModal } from '@/components/pos/VariantSelectionModal';

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
  stock: number;
  category: { id: string; name: string };
  hasVariants?: boolean;
  variants?: Variant[];
}

interface Variant {
  id: string;
  name: string;
  sku: string;
  price: string | number;
  stocks?: Array<{ quantity: number }>;
}

export function ProductSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [variantModal, setVariantModal] = useState<{isOpen: boolean, product: Product | null}>({ isOpen: false, product: null });
  const inputRef = useRef<HTMLInputElement>(null);
  const addItem = useCartStore((s) => s.addItem);
  const debouncedQuery = useDebounce(query, 300);

  // Escáner de barras: si el input llega rápidamente (< 50ms entre chars), probablemente es un escáner
  useEffect(() => {
    if (!debouncedQuery) {
      setShowResults(false);
      return;
    }

    let active = true;

    async function loadProducts() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(debouncedQuery)}&limit=8`);
        const data = await res.json();

        if (!active) return;

        setResults(data.products ?? []);
        setShowResults(true);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  const handleSelect = (product: Product) => {
    if (product.hasVariants && product.variants && product.variants.length > 0) {
      setVariantModal({ isOpen: true, product });
      return;
    }
    const cartProduct: CartProduct = {
      id: product.id,
      name: product.name,
      sku: product.sku,
      price: Number(product.price),
      stock: product.stock,
    };
    addItem(cartProduct);
    setQuery('');
    setResults([]);
    setShowResults(false);
    inputRef.current?.focus();
  };

  const handleVariantSelect = (product: { id: string; name: string }, variant: Variant) => {
    addItem({
      id: product.id,
      variantId: variant.id,
      name: `${product.name} - ${variant.name}`,
      sku: variant.sku,
      price: Number(variant.price),
      stock: variant.stocks?.[0]?.quantity ?? 0
    });
    setVariantModal({ isOpen: false, product: null });
    setQuery('');
    setResults([]);
    setShowResults(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
        <Search className="w-5 h-5 text-slate-600 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          placeholder="Buscar por nombre, SKU o código de barras..."
          className="flex-1 outline-none text-slate-800 placeholder-slate-600 text-base bg-transparent"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); }} className="text-slate-600 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        )}
        {isLoading && (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {results.map((product) => (
            <button
              key={product.id}
              onClick={() => handleSelect(product)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
            >
              <div className="text-left">
                <p className="font-medium text-slate-800 text-sm">{product.name}</p>
                <p className="text-xs text-slate-600">{product.sku} · {product.category.name}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-blue-600">Q{Number(product.price).toFixed(2)}</p>
                <p className={`text-xs ${product.stock <= 0 ? 'text-red-500' : 'text-slate-600'}`}>
                  Stock: {product.stock}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pop-up selector de Variantes */}
      <VariantSelectionModal 
        isOpen={variantModal.isOpen} 
        product={variantModal.product} 
        onClose={() => {
          setVariantModal({ isOpen: false, product: null });
          inputRef.current?.focus();
        }} 
        onSelect={handleVariantSelect} 
      />
    </div>
  );
}
