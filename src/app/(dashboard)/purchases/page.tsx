'use client';

/**
 * Fase 22b · Purchases History migrada a DataTable + useDataTable.
 *
 * El endpoint `/api/purchases` devuelve un array (sin paginación servidor).
 * Se hace paginación + búsqueda client-side recortando el array completo.
 *
 * TODO Fase 24: agregar paginación servidor a /api/purchases (params page, limit, q)
 * y eliminar el slice client-side.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Inbox, Plus, Search, Trash2, ArrowLeft, Save, Loader2, PackageOpen, ClipboardList, ScrollText, Eye } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { VariantSelectionModal } from '@/components/pos/VariantSelectionModal';
import { useToast } from '@/components/ui/toast';
import { PurchaseDetailModal } from '@/components/purchases/PurchaseDetailModal';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

interface Supplier { id: string; name: string; }
interface VariantOption { id: string; name: string; sku: string; price: string | number; stocks?: Array<{ quantity: number }>; }
interface Product { id: string; name: string; sku: string; cost: string; unitOfMeasure: string; hasVariants?: boolean; variants?: VariantOption[]; }
interface PurchaseItem { product: Product; variantId?: string; variantName?: string; quantity: number; cost: number; }
interface PurchaseHistoryItem {
  id: string;
  createdAt: string;
  total: number | string;
  reference?: string | null;
  supplier: { name: string };
  user?: { name?: string | null } | null;
  sourceRfqId?: string | null;
}

export default function PurchasesPage() {
  const router = useRouter();
  const [view, setView] = useState<'history' | 'new'>('history');
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);

  // Mode toggle (Fast = compras directas / Enterprise = workflow PR-RFQ-PO con approval).
  const [mode, setMode] = useState<'fast' | 'enterprise'>('fast');

  // New Purchase State
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [reference, setReference] = useState('');
  const [cart, setCart] = useState<PurchaseItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [variantModalProduct, setVariantModalProduct] = useState<Product | null>(null);
  const { toast } = useToast();

  const debouncedSearch = useDebounce(searchQuery, 400);

  // Tabla servidor-side simulada (endpoint sin paginación real).
  const table = useDataTable<PurchaseHistoryItem>({
    defaultLimit: 25,
    autoLoad: view === 'history',
    onFetch: async ({ page, limit, search, signal }) => {
      const res = await fetch('/api/purchases', { signal });
      if (!res.ok) throw new Error('Error al cargar historial de compras.');
      const json = await res.json();
      const all: PurchaseHistoryItem[] = json.purchases ?? [];
      const term = search.trim().toLowerCase();
      const filtered = term
        ? all.filter(
            (p) =>
              p.supplier.name.toLowerCase().includes(term) ||
              (p.reference && p.reference.toLowerCase().includes(term)),
          )
        : all;
      const start = (page - 1) * limit;
      return { data: filtered.slice(start, start + limit), total: filtered.length };
    },
  });

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers');
      const data = await res.json();
      setSuppliers(data.suppliers || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (view === 'history') {
      void table.refetch();
    } else {
      fetchSuppliers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (!debouncedSearch) { setSearchResults([]); return; }
    fetch(`/api/products?q=${encodeURIComponent(debouncedSearch)}&limit=10`)
      .then(res => res.json())
      .then(data => setSearchResults(data.products || []))
      .catch(() => setSearchResults([]));
  }, [debouncedSearch]);

  const addProduct = (p: Product, variantId?: string, variantName?: string) => {
    if (p.hasVariants && !variantId) {
      setVariantModalProduct(p);
      return;
    }

    const uniqueKey = p.id + (variantId ? `-${variantId}` : '');
    if (cart.find(item => (item.product.id + (item.variantId ? `-${item.variantId}` : '')) === uniqueKey)) return; 

    setCart([...cart, { product: p, variantId, variantName, quantity: 1, cost: Number(p.cost) }]);
    setSearchQuery('');
    setSearchResults([]);
    setVariantModalProduct(null);
  };

  const removeProduct = (productId: string, variantId?: string) => {
    setCart(cart.filter(item => item.product.id !== productId || item.variantId !== variantId));
  };
  
  const updateProduct = (productId: string, variantId: string | undefined, field: 'quantity'|'cost', value: number) => {
    setCart(cart.map(item => (item.product.id === productId && item.variantId === variantId) ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async () => {
    if (!selectedSupplier) {
      toast({ tone: 'error', message: 'Debes seleccionar un proveedor.' });
      return;
    }
    if (cart.length === 0) {
      toast({ tone: 'error', message: 'Debes agregar al menos un producto a la recepción.' });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const payload = {
        supplierId: selectedSupplier,
        reference,
        mode,
        items: cart.map(item => ({ productId: item.product.id, variantId: item.variantId, quantity: item.quantity, cost: item.cost }))
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
        toast({ tone: 'success', message: 'Ingreso logístico procesado correctamente.' });
      } else {
        const errorData = await res.json();
        toast({ tone: 'error', message: errorData.error || 'Error al procesar ingreso logístico.' });
      }
    } catch { toast({ tone: 'error', message: 'Corte de red crítico.' }); } finally { setIsSubmitting(false); }
  };

  if (view === 'new') {
    const totalInput = cart.reduce((acc, item) => acc + (item.quantity * item.cost), 0);

    return (
      <div className="p-4 sm:p-8 max-w-7xl mx-auto h-full flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
          <div className="flex items-center gap-4 flex-1">
            <button onClick={() => setView('history')} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition"><ArrowLeft className="w-5 h-5"/></button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <PackageOpen className="w-6 h-6 text-emerald-600" /> Nueva Recepción de Inventario
              </h1>
              <p className="text-sm text-slate-500">
                Modo {mode === 'fast' ? 'Fast (compra directa)' : 'Enterprise (PO con workflow)'}.
              </p>
            </div>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setMode('fast')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                mode === 'fast' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Fast
            </button>
            <button
              type="button"
              onClick={() => setMode('enterprise')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                mode === 'enterprise' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Enterprise
            </button>
          </div>
        </div>

        {variantModalProduct && (
          <VariantSelectionModal
            isOpen={!!variantModalProduct}
            product={variantModalProduct}
            onClose={() => setVariantModalProduct(null)}
            onSelect={(_, variant) => variantModalProduct && addProduct(variantModalProduct, variant.id, variant.name)}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-hidden">
          {/* Form and Search Panel */}
          <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-6 overflow-y-auto">
            <div>
               <label className="block text-sm font-bold text-slate-700 mb-2">Proveedor Mayorista / Corporativo *</label>
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
                      <tr key={item.product.id + (item.variantId ? `-${item.variantId}` : '')} className="hover:bg-slate-50/50">
                        <td className="p-4">
                          <div className="font-bold text-slate-800">{item.product.name} {item.variantName && <span className="text-emerald-600 ml-1">({item.variantName})</span>}</div>
                          <div className="text-xs text-slate-500">{item.product.sku}</div>
                        </td>
                        <td className="p-4">
                          <input type="number" min="1" value={item.quantity} onChange={(e)=>updateProduct(item.product.id, item.variantId, 'quantity', Number(e.target.value))} className="w-20 text-center p-2 border border-slate-200 rounded-lg mx-auto block font-bold" />
                        </td>
                        <td className="p-4">
                          <input type="number" step="0.01" min="0" value={item.cost} onChange={(e)=>updateProduct(item.product.id, item.variantId, 'cost', Number(e.target.value))} className="w-24 text-center p-2 border border-slate-200 rounded-lg mx-auto block" />
                        </td>
                        <td className="p-4 text-right font-bold text-slate-700">
                          Q{(item.quantity * item.cost).toFixed(2)}
                        </td>
                        <td className="p-4 text-center">
                          <button onClick={()=>removeProduct(item.product.id, item.variantId)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
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
                  <p className="text-3xl font-bold text-slate-800">Q{totalInput.toFixed(2)}</p>
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
  const historyColumns: DataTableColumn<PurchaseHistoryItem>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      mobilePriority: 'meta',
      accessor: (po) => (
        <span className="text-slate-600 font-mono text-xs">
          {format(new Date(po.createdAt), "dd MMM yy HH:mm", { locale: es })}
        </span>
      ),
      exportValue: (po) => format(new Date(po.createdAt), 'dd/MM/yyyy HH:mm'),
    },
    {
      key: 'supplier',
      header: 'Proveedor B2B',
      mobilePriority: 'title',
      accessor: (po) => <span className="font-bold text-slate-800">{po.supplier.name}</span>,
      exportValue: (po) => po.supplier.name,
    },
    {
      key: 'reference',
      header: 'Referencia',
      mobilePriority: 'meta',
      accessor: (po) => (
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{po.reference || '-'}</span>
          {po.sourceRfqId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/purchases/rfq/${po.sourceRfqId}`);
              }}
              className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100"
              aria-label="Ver RFQ origen"
            >
              RFQ
            </button>
          )}
        </div>
      ),
      exportValue: (po) => po.reference || '',
    },
    {
      key: 'user',
      header: 'Operador',
      mobilePriority: 'hidden',
      accessor: (po) => <span className="text-slate-500">{po.user?.name || 'Sistema'}</span>,
      exportValue: (po) => po.user?.name || 'Sistema',
    },
    {
      key: 'total',
      header: 'Inversión',
      mobilePriority: 'highlight',
      cellClassName: 'text-right',
      headerClassName: 'text-right',
      accessor: (po) => (
        <div className="flex items-center justify-end gap-2">
          <span className="font-bold text-emerald-700">Q{Number(po.total).toFixed(2)}</span>
          <Eye className="w-4 h-4 text-slate-300" />
        </div>
      ),
      exportValue: (po) => Number(po.total).toFixed(2),
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Compras' },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Inbox className="w-6 h-6 text-emerald-600" /> Historial de Ingresos Logísticos
          </h1>
          <p className="text-sm text-slate-500 mt-1">Traza de auditoría de todas tus compras selladas y guardadas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push('/purchases/requests')}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition flex items-center gap-2"
          >
            <ClipboardList className="w-4 h-4" /> PRs
          </button>
          <button
            onClick={() => router.push('/purchases/rfq')}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition flex items-center gap-2"
          >
            <ScrollText className="w-4 h-4" /> RFQs
          </button>
          <button onClick={() => setView('new')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2">
            <Plus className="w-5 h-5" /> Nueva Recepción
          </button>
        </div>
      </div>

      <DataTable
        columns={historyColumns}
        data={table.data}
        loading={table.loading}
        total={table.pagination.total}
        page={table.pagination.page}
        pageSize={table.pagination.limit}
        onPageChange={table.pagination.onPageChange}
        onPageSizeChange={table.pagination.onLimitChange}
        getRowId={(po) => po.id}
        onRowClick={(po) => setSelectedDetailId(po.id)}
        search={{
          value: table.search.value,
          onChange: table.search.onChange,
          placeholder: 'Buscar por proveedor o referencia...',
        }}
        empty={
          <EmptyState
            icon={<Inbox className="w-7 h-7" />}
            title="No hay ingresos registrados"
            description="Las recepciones de mercadería que registres aparecerán acá."
          />
        }
      />

      {selectedDetailId && (
        <PurchaseDetailModal
          purchaseId={selectedDetailId}
          onClose={() => setSelectedDetailId(null)}
          onRefresh={() => void table.refetch()}
        />
      )}
    </div>
  );
}
