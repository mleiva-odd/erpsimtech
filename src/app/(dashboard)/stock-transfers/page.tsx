'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowRightLeft, Loader2, Search, Trash2, CheckCircle2, History, Printer, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface Branch { id: string; name: string; code: string; }
interface StockEntry { branchId: string; quantity: number; }
interface ProductVariant { id: string; name: string; sku: string; stocks?: StockEntry[]; }
interface Product { id: string; name: string; sku: string; stocks: StockEntry[]; variantId?: string; hasVariants?: boolean; variants?: ProductVariant[]; }
interface CartItem { product: Product; quantity: number; variantId?: string; }
interface InventoryLookupItem { id: string; variantId?: string; stocks: StockEntry[]; }

interface TransferHistory {
  id: string;
  reference: string;
  createdAt: string;
  fromBranch: { name: string; code: string; };
  toBranch: { id: string; name: string; code: string; };
  user: { name: string; };
  status?: string;
  items: { quantity: number; product: { name: string; sku: string; } }[];
}

function cartItemKey(productId: string, variantId?: string) {
  return `${productId}:${variantId || 'base'}`;
}

export default function StockTransfersPage() {
  const { data: session } = useSession();
  const permissions = session?.user?.permissions ?? [];
  const [activeTab, setActiveTab] = useState<'NEW' | 'HISTORY'>('NEW');

  // New Transfer State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  // History State
  const [history, setHistory] = useState<TransferHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [printData, setPrintData] = useState<TransferHistory | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/branches').then(r => r.json()),
      fetch('/api/products?limit=500').then(r => r.json()),
    ]).then(([branchData, productData]) => {
      if (Array.isArray(branchData)) setBranches(branchData);
      if (productData.products) setProducts(productData.products);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (activeTab === 'HISTORY') {
      setIsLoadingHistory(true);
      fetch('/api/stock-transfers/history')
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) setHistory(data);
          setIsLoadingHistory(false);
        }).catch(() => setIsLoadingHistory(false));
    }
  }, [activeTab]);

  const handleAddToCart = (product: Product) => {
    if (!fromBranchId) {
      toast({ tone: 'error', message: 'Seleccione una sucursal de origen primero.' });
      return;
    }
    const originStock = product.stocks?.find(s => s.branchId === fromBranchId)?.quantity ?? 0;
    if (originStock <= 0) {
      toast({ tone: 'error', message: 'Sin existencias en el origen seleccionado.' });
      return;
    }

    setCart(prev => {
      const key = cartItemKey(product.id, product.variantId);
      const exists = prev.find(item => cartItemKey(item.product.id, item.variantId) === key);
      if (exists) {
        if (exists.quantity >= originStock) return prev;
        return prev.map(item => (cartItemKey(item.product.id, item.variantId) === key) ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { product, quantity: 1, variantId: product.variantId }];
    });
  };

  const updateCartQuantity = (productId: string, variantId: string | undefined, quantity: number) => {
    if (quantity <= 0) {
      return setCart(prev => prev.filter(item => cartItemKey(item.product.id, item.variantId) !== cartItemKey(productId, variantId)));
    }
    const inventoryLookup = products.reduce<InventoryLookupItem[]>((acc, product) => {
      if (product.hasVariants && (product.variants?.length ?? 0) > 0) {
        acc.push(
          ...((product.variants || []).map((variant) => ({
            id: product.id,
            variantId: variant.id,
            stocks: variant.stocks || [],
          })))
        );
        return acc;
      }

      acc.push({ id: product.id, variantId: undefined, stocks: product.stocks || [] });
      return acc;
    }, []);

    const stockMax = inventoryLookup
      .find((product) => cartItemKey(product.id, product.variantId) === cartItemKey(productId, variantId))
      ?.stocks?.find((stock) => stock.branchId === fromBranchId)?.quantity ?? 0;
    const finalQty = Math.min(quantity, stockMax);
    setCart(prev => prev.map(item => (
      cartItemKey(item.product.id, item.variantId) === cartItemKey(productId, variantId)
        ? { ...item, quantity: finalQty }
        : item
    )));
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    setIsSubmitting(true);
    setResult(null);

    const payload = {
      fromBranchId, toBranchId, notes,
      items: cart.map(i => ({ productId: i.product.id, variantId: i.variantId || null, quantity: i.quantity }))
    };

    try {
      const res = await fetch('/api/stock-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        setResult({ type: 'success', message: data.message });
        setCart([]); setNotes('');
        toast({ tone: 'success', message: data.message || 'Transferencia procesada correctamente.' });
        const [productData] = await Promise.all([ fetch('/api/products?limit=500').then(r => r.json()) ]);
        if (productData.products) setProducts(productData.products);
      } else {
        setResult({ type: 'error', message: data.error || 'Error procesando' });
        toast({ tone: 'error', message: data.error || 'Error procesando' });
      }
    } catch (e) {
      setResult({ type: 'error', message: 'Error de red' });
      toast({ tone: 'error', message: 'Error de red' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const executePrint = (record: TransferHistory) => {
    setPrintData(record);
    setTimeout(() => { window.print(); }, 100);
  };

  const handleReceive = async (transferId: string) => {
    const accepted = await confirm({
      title: 'Confirmar recepción',
      message: '¿Confirma que ha recibido esta mercadería físicamente?',
      confirmText: 'Sí, recibir',
      cancelText: 'Cancelar',
      tone: 'warning',
    });
    if (!accepted) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/stock-transfers/${transferId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RECEIVE' }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ tone: 'success', message: data.message || 'Mercadería recibida correctamente.' });
        const histRes = await fetch('/api/stock-transfers/history');
        const histData = await histRes.json();
        if (Array.isArray(histData)) setHistory(histData);
      } else {
        toast({ tone: 'error', message: data.error || 'Error procesando recepción' });
      }
    } catch (e) {
      toast({ tone: 'error', message: 'Error procesando recepción' });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const filteredProducts = searchQuery
    ? products.reduce<Product[]>((acc, product) => {
        const variantCount = product.variants?.length ?? 0;

        if (product.hasVariants && variantCount > 0) {
          acc.push(
            ...((product.variants || []).map((variant) => ({
              ...product,
              id: product.id,
              variantId: variant.id,
              name: `${product.name} - ${variant.name}`,
              sku: variant.sku,
              stocks: variant.stocks || [],
            })))
          );
        } else {
          acc.push(product);
        }

        return acc;
      }, []).filter((product) => product.name.toLowerCase().includes(searchQuery.toLowerCase()) || product.sku.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const role = session?.user?.role;
  const canManageTransfers =
    role === 'SUPER_ADMIN' ||
    permissions.includes('settings:manage') ||
    permissions.includes('inventory:transfer');
  const isGlobalAdmin = role === 'SUPER_ADMIN' || permissions.includes('settings:manage');

  // Si no es admin global, pre-seleccionar y bloquear su origen
  useEffect(() => {
    if (!isGlobalAdmin && branches.length > 0 && session?.user?.branchId) {
       setFromBranchId(session.user.branchId);
    }
  }, [isGlobalAdmin, branches, session?.user?.branchId]);

  if (!canManageTransfers) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-slate-500">
        <ArrowRightLeft className="w-12 h-12 mb-4 opacity-50" />
        <h2 className="font-bold text-lg mb-2 text-slate-700">Acceso Restringido</h2>
        <p>No cuenta con permisos para operaciones logísticas.</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-8 max-w-7xl mx-auto h-full flex flex-col gap-6 print:hidden">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Módulo de Logística</h1>
            <p className="text-sm text-slate-600 mt-1">Gestione y audite el movimiento de activos entre sucursales.</p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('NEW')}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${activeTab === 'NEW' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <ArrowRightLeft className="w-4 h-4" /> Nueva Orden
            </button>
            <button
              onClick={() => setActiveTab('HISTORY')}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${activeTab === 'HISTORY' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <History className="w-4 h-4" /> Bitácora
            </button>
          </div>
        </div>

        {activeTab === 'NEW' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
            {/* Panel Formulario */}
            <div className="lg:col-span-2 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Orden de Remisión</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Origen (Bodega Salida)</label>
                    <select required disabled={!isGlobalAdmin} value={fromBranchId} onChange={e => { setFromBranchId(e.target.value); setCart([]); }} className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-slate-800 text-sm focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-500">
                      <option value="">Seleccione sucursal...</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Destino (Bodega Entrada)</label>
                    <select required disabled={!fromBranchId} value={toBranchId} onChange={e => setToBranchId(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-slate-800 text-sm focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-50">
                      <option value="">Seleccione sucursal...</option>
                      {branches.filter(b => b.id !== fromBranchId).map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Motivo / No. Documento Ext.</label>
                  <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej. Abastecimiento Semanal" className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-slate-800 text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-[400px]">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Detalle de Productos</h2>
                  <div className="relative w-64">
                    <Search className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="text" placeholder="Buscar por código o nombre..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} disabled={!fromBranchId || !toBranchId} className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded text-sm text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-100" />
                  </div>
                </div>

                <div className="flex-1 overflow-x-auto relative">
                  {searchQuery && filteredProducts.length > 0 && (
                    <div className="absolute top-0 left-0 right-0 bg-white shadow-2xl border-b border-slate-200 z-10 max-h-64 overflow-y-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 bg-slate-50">
                          <tr>
                            <th className="px-4 py-2 font-semibold">Producto</th>
                            <th className="px-4 py-2 font-semibold text-center">Disp.</th>
                            <th className="px-4 py-2 font-semibold text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredProducts.slice(0, 10).map(p => {
                            const stockMax = p.stocks?.find((s) => s.branchId === fromBranchId)?.quantity ?? 0;
                            const variantCount = p.variants?.length ?? 0;
                            return (
                              <tr key={p.id} className="hover:bg-blue-50">
                                <td className="px-4 py-2 text-slate-800 font-medium">[{p.sku}] {p.name}{p.hasVariants ? ` (${variantCount})` : ''}</td>
                                <td className="px-4 py-2 text-center text-slate-700">{stockMax}</td>
                                <td className="px-4 py-2 text-right">
                                  <button onClick={() => { handleAddToCart(p); setSearchQuery(''); }} className="text-blue-600 hover:text-blue-800 font-bold px-2 py-1 bg-blue-100 rounded text-xs">Agregar</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-xs text-slate-600 bg-slate-100 uppercase border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Producto</th>
                        <th className="px-6 py-3 font-semibold text-center w-32">Cantidad</th>
                        <th className="px-6 py-3 font-semibold text-center w-16">-</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cart.length === 0 ? (
                        <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-500">Agregue productos utilizando el buscador de arriba.</td></tr>
                      ) : (
                        cart.map(item => (
                          <tr key={cartItemKey(item.product.id, item.variantId)} className="hover:bg-slate-50">
                            <td className="px-6 py-3"><p className="font-bold text-slate-800">{item.product.name}</p><p className="text-xs text-slate-500">{item.product.sku}</p></td>
                            <td className="px-6 py-3 text-center"><input type="number" min="1" value={item.quantity} onChange={(e) => updateCartQuantity(item.product.id, item.variantId, parseInt(e.target.value) || 0)} className="w-20 text-center border border-slate-300 rounded px-2 py-1 text-slate-800 font-medium focus:outline-none focus:border-blue-500" /></td>
                            <td className="px-6 py-3 text-center"><button type="button" onClick={() => updateCartQuantity(item.product.id, item.variantId, 0)} className="p-1.5 text-slate-600 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Resumen Sidebar */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col h-max sticky top-6">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Procesar Orden</h2>
              <div className="space-y-3 mb-6 text-sm">
                <div className="flex justify-between text-slate-700"><span className="font-semibold">Líneas de artítuclos:</span><span className="font-bold">{cart.length}</span></div>
                <div className="flex justify-between text-slate-700"><span className="font-semibold">Total unidades (Q):</span><span className="font-bold">{cart.reduce((acc, item) => acc + item.quantity, 0)}</span></div>
              </div>
              {result && (
                <div className={`mb-4 px-3 py-2 rounded text-sm font-bold flex gap-2 ${result.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {result.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <Loader2 className="w-4 h-4 mt-0.5" />}
                  <span>{result.message}</span>
                </div>
              )}
              <button onClick={handleTransfer} disabled={isSubmitting || cart.length === 0 || !fromBranchId || !toBranchId} className="w-full py-2.5 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {isSubmitting ? 'Guardando...' : 'Autorizar y Generar'}
              </button>
            </div>
          </div>
        )}

        {/* --- PESTAÑA BITACORA --- */}
        {activeTab === 'HISTORY' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Trazabilidad ID</th>
                    <th className="px-6 py-4 font-semibold">Fecha / Hora</th>
                    <th className="px-6 py-4 font-semibold">Ruta Operativa</th>
                    <th className="px-6 py-4 font-semibold">Estado</th>
                    <th className="px-6 py-4 font-semibold text-center">Unidades</th>
                    <th className="px-6 py-4 font-semibold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingHistory ? (
                    <tr><td colSpan={6} className="py-12 text-center text-slate-600"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />Cargando historial...</td></tr>
                  ) : history.length > 0 ? (
                    history.map(record => (
                      <tr key={record.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <p className="font-mono text-xs font-bold text-slate-700">{record.id.split('-')[0].toUpperCase()}</p>
                          {record.reference && <p className="text-xs text-slate-500 mt-1">{record.reference}</p>}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{format(new Date(record.createdAt), "dd MMM yy - HH:mm", { locale: es })}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                             <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs font-bold text-slate-700">{record.fromBranch.name}</span>
                             <ArrowRightLeft className="w-3 h-3 text-slate-600" />
                             <span className="px-2 py-0.5 bg-blue-50 border border-blue-100 rounded text-xs font-bold text-blue-700">{record.toBranch.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                           {record.status === 'PENDING' ? (
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded">En Tránsito</span>
                           ) : (
                              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">Recibido</span>
                           )}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-slate-800">
                           {record.items.reduce((acc, curr) => acc + curr.quantity, 0)} u.
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex gap-2 justify-center">
                            {record.status === 'PENDING' && (isGlobalAdmin || session?.user?.branchId === record.toBranch.id) && (
                              <button onClick={() => handleReceive(record.id)} className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded flex items-center gap-1 font-bold transition-all text-xs shadow-sm">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Recibir
                              </button>
                            )}
                            <button onClick={() => executePrint(record)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 hover:text-blue-700 text-slate-600 rounded flex items-center gap-2 font-bold transition-all text-xs">
                              <Printer className="w-3.5 h-3.5" /> PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={6} className="py-12 text-center text-slate-600">No existen registros documentados en el sistema.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* --- MODO IMPRESIÓN (OCULTO EN PANTALLA, VISIBLE EN PDF) --- */}
      {printData && (
        <div className="hidden print:block absolute inset-0 bg-white z-[9999] text-black">
          <div className="max-w-[800px] mx-auto p-12">
            <div className="border-b-2 border-slate-800 pb-6 mb-6 flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold uppercase tracking-widest text-slate-900 flex items-center gap-3">
                  <FileText className="w-8 h-8" /> ORDEN DE REMISIÓN
                </h1>
                <p className="font-mono text-sm mt-2 text-slate-600">ID: {printData.id}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-lg text-slate-800">SIMTECH ENT. LOGISTICS</p>
                <p className="text-sm text-slate-600 mt-1">Fecha Emisión: {format(new Date(printData.createdAt), "dd/MM/yyyy HH:mm", { locale: es })}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div className="p-4 border border-slate-300 rounded-lg">
                <p className="text-xs uppercase font-bold text-slate-500 mb-1">Bodega de Origen (Expide)</p>
                <p className="font-bold text-xl text-slate-800">{printData.fromBranch.name}</p>
                <p className="text-sm mt-1 text-slate-600">A cargo de: {printData.user.name}</p>
              </div>
              <div className="p-4 border border-slate-300 rounded-lg bg-slate-50">
                <p className="text-xs uppercase font-bold text-slate-500 mb-1">Bodega Destino (Recibe)</p>
                <p className="font-bold text-xl text-blue-800">{printData.toBranch.name}</p>
                {printData.reference && <p className="text-sm mt-1 font-bold italic text-slate-700">Ref: {printData.reference}</p>}
              </div>
            </div>

            <table className="w-full text-left text-sm border-collapse mb-10">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border border-slate-300 px-4 py-3 font-bold uppercase text-xs">SKU</th>
                  <th className="border border-slate-300 px-4 py-3 font-bold uppercase text-xs">Descripción de Producto</th>
                  <th className="border border-slate-300 px-4 py-3 font-bold uppercase text-xs text-center">Unidades</th>
                </tr>
              </thead>
              <tbody>
                {printData.items.map((it, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="border border-slate-300 px-4 py-2 font-mono text-xs">{it.product.sku}</td>
                    <td className="border border-slate-300 px-4 py-2 font-bold">{it.product.name}</td>
                    <td className="border border-slate-300 px-4 py-2 text-center font-bold text-lg">{it.quantity}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 text-white">
                  <td colSpan={2} className="border border-slate-800 px-4 py-3 text-right font-bold uppercase text-xs">Total Unidades Transferidas</td>
                  <td className="border border-slate-800 px-4 py-3 text-center font-bold text-xl">
                    {printData.items.reduce((a, b) => a + b.quantity, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="grid grid-cols-2 gap-12 mt-20 px-8">
              <div className="border-t border-black pt-2 text-center">
                <p className="font-bold text-sm">ENTREGADO POR</p>
                <p className="text-xs text-slate-500 mt-1">{printData.user.name} - Autorizado</p>
                <p className="text-xs text-slate-500 mt-1">Firma / Sello</p>
              </div>
              <div className="border-t border-black pt-2 text-center">
                <p className="font-bold text-sm">RECIBIDO POR (CONFORME)</p>
                <p className="text-xs text-slate-500 mt-1">Nombre: ____________________</p>
                <p className="text-xs text-slate-500 mt-1">Firma / Sello</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
