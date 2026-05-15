'use client';

/**
 * Fase 22c-4 · RfqItemsForm
 *
 * Formulario reutilizable para captura de items de una RFQ. Usado en el
 * wizard de creación y en el form de edición (cuando RFQ en DRAFT).
 */

import { useEffect, useRef, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';

export interface RfqItemDraft {
  productId: string;
  productName: string;
  productSku: string;
  variantId?: string | null;
  quantity: number;
  unit?: string | null;
  specifications?: string | null;
  observations?: string | null;
}

interface RfqItemsFormProps {
  items: RfqItemDraft[];
  onChange: (next: RfqItemDraft[]) => void;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure?: string | null;
}

export function RfqItemsForm({ items, onChange }: RfqItemsFormProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpiar el timer al unmount. NO usamos un effect que reacciona a `search`
  // porque eso requeriría setState sincrónico (react-hooks/set-state-in-effect).
  // La búsqueda se dispara desde el onChange del input.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetch(`/api/products?q=${encodeURIComponent(value.trim())}&limit=10`)
        .then((r) => r.json())
        .then((d) => setResults(d.products || []))
        .catch(() => setResults([]));
    }, 300);
  };

  const addProduct = (p: ProductSearchResult) => {
    if (items.find((i) => i.productId === p.id)) return;
    onChange([
      ...items,
      {
        productId: p.id,
        productName: p.name,
        productSku: p.sku,
        quantity: 1,
        unit: p.unitOfMeasure ?? null,
        specifications: '',
        observations: '',
      },
    ]);
    setSearch('');
    setResults([]);
  };

  const updateItem = (idx: number, patch: Partial<RfqItemDraft>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-widest">
          Buscar producto
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="SKU o nombre del producto..."
            className="w-full pl-9 pr-4 py-3 border-2 border-slate-100 rounded-xl outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 text-sm"
            aria-label="Buscar producto"
          />
        </div>
        {results.length > 0 && (
          <div className="mt-2 bg-slate-50 rounded-xl divide-y divide-slate-100 max-h-48 overflow-auto">
            {results.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => addProduct(p)}
                className="w-full text-left px-3 py-2 hover:bg-white transition"
              >
                <span className="text-sm font-bold">{p.name}</span>{' '}
                <span className="text-xs text-slate-500">{p.sku}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center text-sm text-slate-400 py-8 italic">
          Aún no agregaste items.
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-3 space-y-2">
          {items.map((it, idx) => (
            <div key={`${it.productId}-${idx}`} className="bg-white rounded-lg p-3 space-y-2">
              <div className="flex justify-between gap-2 items-start">
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">{it.productName}</p>
                  <p className="text-[10px] text-slate-500">{it.productSku}</p>
                </div>
                <button
                  type="button"
                  aria-label="Quitar item"
                  onClick={() => removeItem(idx)}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 mb-0.5 uppercase">
                    Cantidad
                  </label>
                  <input
                    type="number"
                    min={0.001}
                    step={0.001}
                    value={it.quantity}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      updateItem(idx, { quantity: Number.isFinite(v) ? v : 0 });
                    }}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                    aria-label={`Cantidad ${it.productName}`}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 mb-0.5 uppercase">
                    Unidad
                  </label>
                  <input
                    type="text"
                    value={it.unit ?? ''}
                    onChange={(e) => updateItem(idx, { unit: e.target.value || null })}
                    placeholder="u, kg, lb..."
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                    aria-label={`Unidad ${it.productName}`}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[9px] font-bold text-slate-400 mb-0.5 uppercase">
                    Especificaciones / Marca
                  </label>
                  <input
                    type="text"
                    value={it.specifications ?? ''}
                    onChange={(e) =>
                      updateItem(idx, { specifications: e.target.value || null })
                    }
                    placeholder="Ej. marca específica, calibre..."
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                    aria-label={`Especificaciones ${it.productName}`}
                  />
                </div>
                <div className="col-span-2 md:col-span-4">
                  <label className="block text-[9px] font-bold text-slate-400 mb-0.5 uppercase">
                    Observaciones al proveedor
                  </label>
                  <input
                    type="text"
                    value={it.observations ?? ''}
                    onChange={(e) =>
                      updateItem(idx, { observations: e.target.value || null })
                    }
                    placeholder="Notas internas / al proveedor"
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                    aria-label={`Observaciones ${it.productName}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
