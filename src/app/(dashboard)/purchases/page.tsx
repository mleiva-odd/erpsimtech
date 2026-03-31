'use client';

import { useEffect, useState } from 'react';
import { Inbox, Plus, Search, Trash2, ArrowLeft, Save, Loader2, PackageOpen } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

interface Supplier { id: string; name: string; }
interface Product { id: string; name: string; sku: string; cost: string; unitOfMeasure: string; }
interface PurchaseItem { product: Product; quantity: number; cost: number; }

export default function PurchasesPage() {
  const [view, setView] = useState<'history' | 'new'>('history');
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Purchase State
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [reference, setReference] = useState('');
  const [cart, setCart] = useState<PurchaseItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 400);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/purchases');
      const data = await res.json();
      setPurchases(data.purchases || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers');
      const data = await res.json();
      setSuppliers(data.suppliers || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (view === 'history') fetchHistory();
    else fetchSuppliers();
  }, [view]);

  useEffect(() => {
    if (!debouncedSearch) { setSearchResults([]); return; }
    setIsSearching(true);
    fetch(`/api/products?q=${encodeURIComponent(debouncedSearch)}&limit=10`)
      .then(res => res.json())
      .then(data => setSearchResults(data.products || []))
      .finally(() => setIsSearching(false));
  }, [debouncedSearch]);

  const addProduct = (p: Product) => {
    if (cart.find(item => item.product.id === p.id)) return; // prevent dups
    setCart([...cart, { product: p, quantity: 1, cost: Number(p.cost) }]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeProduct = (id: string) => setCart(cart.filter(item => item.product.id !== id));
  
  const updateProduct = (id: string, field: 'quantity'|'cost', value: number) => {
    setCart(cart.map(item => item.product.id === id ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async () => {
    if (!selectedSupplier) return alert('Debes seleccionar un proveedor.');
    if (cart.length === 0) return alert('Debes agregar al menos un producto a la recepción.');
    
    setIsSubmitting(true);
    try {
      const payload = {
        supplierId: selectedSupplier,
        reference,
        items: cart.map(item => ({ productId: item.product.id, quantity: item.quantity, cost: item.cost }))
      };
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setView('history');
        setCart([]);
        setReference('');
        setSelectedSupplier('');
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Error al procesar ingreso logístico.');
      }
    } catch { alert('Corte de red crítico.'); } finally { setIsSubmitting(false); }
  };

  if (view === 'new') {
    const totalInput = cart.reduce((acc, item) => acc + (item.quantity * item.cost), 0);

    return (
      <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setView('history')} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition"><ArrowLeft className="w-5 h-5"/></button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <PackageOpen className="w-6 h-6 text-emerald-600" /> Nueva Recepción de Inventario
            </h1>
            <p className="text-sm text-slate-500">Documento Transaccional B2B ERP</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-hidden">
          {/* Form and Search Panel */}
          <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-6 overflow-y-auto">
            <div>
               <label className="block text-sm font-bold text-slate-700 mb-2">Proveedor B2B *</label>
               <select required value={selectedSupplier} onChange={(e)=>setSelectedSupplier(e.target.value)} className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none bg-slate-50">
                 <option value="" disabled>Seleccione el socio logístico</option>
                 {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
               </select>
            </div>
            
            <div>
               <label className="block text-sm font-bold text-slate-700 mb-2">Ref. Factura / Tracking</label>
               <input type="text" placeholder="Ej. Serie A-5942" value={reference} onChange={(e)=>setReference(e.target.value)} className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none bg-slate-50" />
            </div>

            <div className="pt-4 border-t relative">
               <label className="block text-sm font-bold text-slate-700 mb-2">Añadir Productos a Ingreso</label>
               <div className="relative">
                 <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                 <input type="text" placeholder="Escanea o busca SKUs..." value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-emerald-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-emerald-50" />
               </div>
               
               {/* Search Results Dropdown */}
               {searchResults.length > 0 && (
                 <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto">
                   {searchResults.map(p => (
                     <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left p-3 hover:bg-emerald-50 border-b border-slate-50 last:border-0 transition flex flex-col">
                       <span className="font-bold text-slate-800">{p.name}</span>
                       <span className="text-xs text-slate-500">{p.sku} • Costo Base: Q{Number(p.cost).toFixed(2)}</span>
                     </button>
                   ))}
                 </div>
               )}
            </div>
          </div>

          {/* Cart Table Panel */}
          <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="overflow-x-auto flex-1 h-full p-4">
               {cart.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <PackageOpen className="w-16 h-16 mb-4 opacity-50" />
                    <p className="font-medium text-lg">La orden de ingreso está vacía</p>
                    <p className="text-sm">Busca un producto en el panel izquierdo para cargarlo a bodega.</p>
                 </div>
               ) : (
                 <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b rounded-t-xl">
                    <tr>
                      <th className="p-4 font-semibold rounded-tl-xl">Producto</th>
                      <th className="p-4 font-semibold text-center">Cant. Ingresa</th>
                      <th className="p-4 font-semibold text-center">Costo Unit. (Q)</th>
                      <th className="p-4 font-semibold text-right">Subtotal</th>
                      <th className="p-4 font-semibold text-center">Remover</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cart.map(item => (
                      <tr key={item.product.id} className="hover:bg-slate-50/50">
                        <td className="p-4">
                          <div className="font-bold text-slate-800">{item.product.name}</div>
                          <div className="text-xs text-slate-500">{item.product.sku} ({item.product.unitOfMeasure})</div>
                        </td>
                        <td className="p-4">
                          <input type="number" min="1" value={item.quantity} onChange={(e)=>updateProduct(item.product.id, 'quantity', Number(e.target.value))} className="w-20 text-center p-2 border border-slate-200 rounded-lg mx-auto block font-bold" />
                        </td>
                        <td className="p-4">
                          <input type="number" step="0.01" min="0" value={item.cost} onChange={(e)=>updateProduct(item.product.id, 'cost', Number(e.target.value))} className="w-24 text-center p-2 border border-slate-200 rounded-lg mx-auto block" />
                        </td>
                        <td className="p-4 text-right font-bold text-slate-700">
                          Q{(item.quantity * item.cost).toFixed(2)}
                        </td>
                        <td className="p-4 text-center">
                          <button onClick={()=>removeProduct(item.product.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                 </table>
               )}
            </div>
            
            {cart.length > 0 && (
              <div className="border-t border-slate-200 p-6 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Valorización del Inventario Recibido</p>
                  <p className="text-3xl font-black text-slate-800">Q{totalInput.toFixed(2)}</p>
                </div>
                <button disabled={isSubmitting} onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-bold shadow-lg transition-colors flex items-center gap-2 disabled:opacity-50">
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5"/>} Inyectar a Bodega
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // History View
  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Inbox className="w-6 h-6 text-emerald-600" /> Historial de Ingresos Logísticos
          </h1>
          <p className="text-sm text-slate-500 mt-1">Traza de auditoría de todas tus compras selladas y guardadas.</p>
        </div>
        <button onClick={() => setView('new')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2">
          <Plus className="w-5 h-5" /> Nueva Recepción
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden">
        <div className="overflow-x-auto h-full">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-slate-500 bg-slate-50 uppercase sticky top-0 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Fecha</th>
                <th className="px-6 py-4 font-semibold">Proveedor B2B</th>
                <th className="px-6 py-4 font-semibold">Referencia</th>
                <th className="px-6 py-4 font-semibold">Operador Bodega</th>
                <th className="px-6 py-4 font-semibold text-right">Inversión (Valor Costo)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">Cargando bitácora de auditoría...</td></tr>
              ) : purchases.length > 0 ? (
                purchases.map(po => (
                  <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-600 font-mono text-xs">{new Date(po.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">{po.supplier.name}</td>
                    <td className="px-6 py-4 text-slate-500">{po.reference || '-'}</td>
                    <td className="px-6 py-4 text-slate-500">{po.user?.name || 'Sistema'}</td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-700 bg-emerald-50/50">Q{Number(po.total).toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">No hay ingresos registrados a bodega.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
