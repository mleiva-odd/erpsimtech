'use client';

import { useState, useEffect } from 'react';
import { X, Save, Trash2, Loader2, Search, Package, Plus } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/components/ui/toast';

interface BundleModalProps {
  product?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function BundleModal({ product, onClose, onSuccess }: BundleModalProps) {
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedParent, setSelectedParent] = useState<any>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    price: 0,
    categoryId: '',
    description: '',
  });

  const [bundleItems, setBundleItems] = useState<{ id: string; variantId?: string; name: string; quantity: number; cost: number; uniqueKey: string }[]>([]);

  useEffect(() => {
    fetch('/api/categories').then(res => res.json()).then(data => {
      setCategories(data);
      if (data.length > 0) setFormData(f => ({ ...f, categoryId: data[0].id }));
    });
  }, []);

  useEffect(() => {
    if (product) {
       setIsLoading(true);
       fetch(`/api/products/${product.id}`)
          .then(res => res.json())
          .then(data => {
             setFormData({
                name: data.name,
                sku: data.sku,
                barcode: data.barcode || '',
                price: Number(data.price),
                categoryId: data.categoryId,
                description: data.description || '',
             });
             if (data.bundleItems) {
                setBundleItems(data.bundleItems.map((b: any) => ({
                   id: b.componentId,
                   variantId: b.variantId || null,
                   name: b.variant ? `${b.component.name} - ${b.variant.name}` : b.component.name,
                   quantity: b.quantity,
                   cost: Number(b.variant ? b.variant.cost : b.component.cost),
                   uniqueKey: b.variantId ? `${b.componentId}-${b.variantId}` : b.componentId
                })));
             }
             setIsLoading(false);
          });
    }
  }, [product]);

  useEffect(() => {
    if (debouncedQuery.length > 1) {
      if (searchQuery !== debouncedQuery) setSelectedParent(null);
      fetch(`/api/products?q=${encodeURIComponent(debouncedQuery)}&limit=5`)
        .then(res => res.json())
        .then(data => setSearchResults(data.products.filter((p: any) => !p.isBundle)))
        .catch(() => {});
    } else {
      setSearchResults([]);
      setSelectedParent(null);
    }
  }, [debouncedQuery]);

  const addComponent = (product: any) => {
    const key = product.variantId ? `${product.baseId}-${product.variantId}` : product.baseId;
    if (bundleItems.find(i => i.uniqueKey === key)) return;
    setBundleItems([...bundleItems, { id: product.baseId, variantId: product.variantId, name: product.name, quantity: 1, cost: Number(product.cost), uniqueKey: key }]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const currentCost = bundleItems.reduce((acc, item) => acc + (item.cost * item.quantity), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bundleItems.length < 2) {
      toast({ tone: 'error', message: 'Un combo debe tener al menos 2 productos.' });
      return;
    }

    setIsLoading(true);
    const payload = {
      ...formData,
      isBundle: true,
      hasVariants: false,
      stock: 0, // Stock is calculated dynamically for bundles, but we set to 0 initially
      minStock: 0,
      cost: currentCost,
      bundleItems: bundleItems.map(b => ({ componentId: b.id, variantId: b.variantId || null, quantity: b.quantity }))
    };

    try {
      const isEditing = !!product;
      const res = await fetch(isEditing ? `/api/products/${product.id}` : '/api/products', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) onSuccess();
      else {
        const data = await res.json();
        toast({ tone: 'error', message: data.error || 'Error guardando combo' });
      }
    } catch {
      toast({ tone: 'error', message: 'Error de conexión' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] border border-slate-100 animate-in fade-in zoom-in duration-300">
        <div className="px-8 pt-8 pb-4 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Configurador de Combos</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Armado de Kits y Paquetes Promocionales</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex gap-6 custom-scrollbar">
          {/* Col 1: Datos del Combo */}
          <form id="bundle-form" onSubmit={handleSubmit} className="w-1/2 space-y-6">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Atributos del Master SKU</h3>
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Nombre del Combo *</label>
              <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800 text-sm" placeholder="Ej: Promo Parrillada Familiar" />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">SKU *</label>
                <input required type="text" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} className="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-mono font-bold text-slate-800 text-xs" placeholder="CMB-001" />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Precio Combo (Q) *</label>
                <input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: Number(e.target.value)})} className="w-full px-4 py-2.5 bg-blue-50/50 border-2 border-blue-100 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-bold text-blue-600 text-lg" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase ml-1">Categoría *</label>
              <select required value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})} className="w-full px-4 py-2.5 border-2 border-slate-100 bg-white rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all font-semibold text-slate-800 text-sm">
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="bg-slate-50 border rounded-xl p-4 mt-4">
               <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Costo Calculado (Suma piezas):</span>
                  <span className="font-bold text-slate-700">Q{currentCost.toFixed(2)}</span>
               </div>
               <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-500 font-medium">Margen de Ganancia:</span>
                  <span className="font-bold text-emerald-600">Q{(formData.price - currentCost).toFixed(2)}</span>
               </div>
            </div>
          </form>

          {/* Col 2: Selector de Componentes */}
          <div className="w-1/2 flex flex-col border-l border-slate-100 pl-6 space-y-4">
             <h3 className="font-bold border-b pb-2 text-slate-800">Productos Incluidos</h3>
             
             {/* Buscador */}
             <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Buscar producto para agregar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                {searchResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 bg-white border border-slate-200 mt-1 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {selectedParent ? (
                      <div>
                        <div className="px-4 py-2 bg-slate-50 border-b flex justify-between items-center sticky top-0">
                          <span className="font-bold text-slate-700 text-sm">Seleccione la variante:</span>
                          <button type="button" onClick={() => setSelectedParent(null)} className="text-slate-500 hover:text-slate-800 text-xs font-bold px-2 py-1 bg-slate-200 rounded">Volver</button>
                        </div>
                        {selectedParent.variants.map((v: any) => (
                           <button key={v.id} type="button" onClick={() => { addComponent({ ...v, baseId: selectedParent.id, variantId: v.id, name: `${selectedParent.name} - ${v.name}`, cost: v.cost || selectedParent.cost }); setSelectedParent(null); }} className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b flex justify-between items-center transition-colors">
                              <div>
                                <div className="font-bold text-sm text-slate-800">{selectedParent.name} - {v.name}</div>
                                <div className="text-xs text-slate-500 font-mono">{v.sku}</div>
                              </div>
                              <div className="text-indigo-600 font-bold text-sm"><Plus className="w-4 h-4"/></div>
                           </button>
                        ))}
                      </div>
                    ) : (
                      searchResults.map((p: any) => (
                        <button key={p.id} type="button" onClick={() => {
                          if (p.hasVariants && p.variants?.length > 0) {
                            setSelectedParent(p);
                          } else {
                            addComponent({...p, baseId: p.id, variantId: null});
                          }
                        }} className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b flex justify-between items-center transition-colors">
                          <div>
                             <div className="font-bold text-sm text-slate-800">{p.name} {p.hasVariants ? `(${p.variants.length} variantes)` : ''}</div>
                             <div className="text-xs text-slate-500 font-mono">{p.sku}</div>
                          </div>
                          {p.hasVariants ? (
                            <div className="text-slate-400 font-bold text-xs uppercase tracking-wider">Ver Opciones</div>
                          ) : (
                            <div className="text-indigo-600 font-bold text-sm"><Plus className="w-4 h-4"/></div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
             </div>

             {/* Lista */}
             <div className="flex-1 bg-slate-50 rounded-xl border p-2 overflow-y-auto space-y-2">
                {bundleItems.length === 0 ? (
                  <div className="text-center text-slate-400 py-10 text-sm">Escanea o busca productos arriba para armar tu combo.</div>
                ) : (
                  bundleItems.map((item, idx) => (
                    <div key={item.uniqueKey} className="bg-white border rounded-lg p-3 flex items-center justify-between shadow-sm">
                       <div className="flex-1 truncate pr-4">
                         <div className="font-bold text-sm text-slate-800 truncate">{item.name}</div>
                         <div className="text-[10px] text-slate-400">Costo Unit: Q{item.cost.toFixed(2)}</div>
                       </div>
                       <div className="flex items-center gap-3">
                          <input type="number" min="1" value={item.quantity} onChange={(e) => {
                            const newArr = [...bundleItems];
                            newArr[idx].quantity = Number(e.target.value);
                            setBundleItems(newArr);
                          }} className="w-16 border rounded text-center font-bold py-1 text-sm outline-none focus:border-indigo-500" />
                          <button type="button" onClick={() => setBundleItems(bundleItems.filter(i => i.uniqueKey !== item.uniqueKey))} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                       </div>
                    </div>
                  ))
                )}
             </div>
          </div>
        </div>

        <div className="px-8 py-6 border-t border-slate-100 flex gap-4 justify-end items-center bg-slate-50/50 rounded-b-[2rem]">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-6 py-3 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-all text-sm"
            >
              Cancelar
            </button>
            <button 
              form="bundle-form" 
              type="submit" 
              disabled={isLoading} 
              className="flex items-center gap-2.5 px-10 py-3.5 bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 text-white rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-50 text-sm"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} 
              Guardar Configuración
            </button>
        </div>
      </div>
    </div>
  );
}
