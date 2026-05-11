'use client';

import { useState, useEffect } from 'react';
import { X, Search, Plus, Minus, CreditCard, User, Package, Save, Loader2 } from 'lucide-react';
import { useBranchStore } from '@/stores/branchStore';
import { useToast } from '@/components/ui/toast';

interface RemoteSaleWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
}

interface CartItem extends Product {
  quantity: number;
}

interface Customer {
  id: string;
  name: string;
  nit: string | null;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string | null;
  price: number | string;
  stock: number;
}

export function RemoteSaleWizard({ onClose, onSuccess }: RemoteSaleWizardProps) {
  const { selectedBranchId } = useBranchStore();
  const { toast } = useToast();

  const [submitting, setSubmitting] = useState(false);

  // Cart
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Customization
  const [discount, setDiscount] = useState(0);

  // Customer
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'TRANSFER' | 'CARD' | 'CASH' | 'CREDIT'>('TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');

  // Search Products
  useEffect(() => {
    async function load() {
      if (searchQuery.length < 2) {
        setProducts([]);
        return;
      }
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(searchQuery)}&limit=10${selectedBranchId ? `&branchId=${selectedBranchId}` : ''}`);
        const data = await res.json();
        
        const mapped = ((data.products || []) as ProductSearchResult[]).map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku || '',
          price: Number(p.price),
          stock: Number(p.stock || 0)
        }));
        setProducts(mapped);
      } catch (e) {
        console.error(e);
      }
    }
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [searchQuery, selectedBranchId]);

  // Search Customers
  useEffect(() => {
    async function load() {
      if (customerSearch.length < 2) {
        setCustomers([]);
        return;
      }
      try {
        const res = await fetch(`/api/customers?search=${customerSearch}&limit=5`);
        const data = await res.json();
        setCustomers(data.data || []);
      } catch (e) {
        console.error(e);
      }
    }
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
        toast({ tone: 'error', message: 'Producto sin stock.'});
        return;
    }
    setCart(prev => {
      const exists = prev.find(i => i.id === product.id);
      if (exists) {
        if (exists.quantity >= product.stock) {
            toast({ tone: 'warning', message: 'Stock máximo alcanzado.' });
            return prev;
        }
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setSearchQuery('');
    setProducts([]);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const nq = Math.max(1, Math.min(item.quantity + delta, item.stock));
        return { ...item, quantity: nq };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = subtotal - (subtotal * (discount / 100));

  const handleSubmit = async () => {
    if (cart.length === 0) {
      toast({ tone: 'error', message: 'Agrega al menos un producto' });
      return;
    }

    if ((paymentMethod === 'TRANSFER' || paymentMethod === 'CARD') && !paymentReference.trim()) {
      toast({ tone: 'error', message: 'La referencia de pago es obligatoria para este método' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        channel: 'REMOTE',
        status: 'COMPLETED',
        customerId: selectedCustomer?.id || null,
        discount,
        items: cart.map(i => ({
          productId: i.id,
          quantity: i.quantity,
          unitPrice: i.price,
        })),
        payments: [{
          method: paymentMethod,
          amount: total,
          reference: paymentReference.trim() || null
        }]
      };

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({ tone: 'success', message: 'Venta remota procesada exitosamente' });
      onSuccess();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error al procesar venta' });
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-slate-900/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600"><path d="M5 12s2.545-5 7-5c4.454 0 7 5 7 5s-2.546 5-7 5c-4.455 0-7-5-7-5z"/><path d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M21 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2"/><path d="M21 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2"/></svg>
              Nueva Venta
            </h2>
            <p className="text-xs text-slate-500 mt-1">Crear venta remota/rápida directa</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Customer Selection */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><User className="w-3 h-3" /> Cliente (Opcional)</label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between bg-purple-50 border border-purple-100 p-3 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-purple-900">{selectedCustomer.name}</p>
                  {selectedCustomer.nit && <p className="text-[10px] text-purple-600 font-mono mt-0.5">NIT: {selectedCustomer.nit}</p>}
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="p-1.5 text-purple-400 hover:text-purple-600 hover:bg-purple-100 rounded-lg"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Buscar cliente por nombre o NIT..."
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-300 transition"
                />
                {customers.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-100 shadow-xl rounded-xl overflow-hidden">
                    {customers.map(c => (
                      <button key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); setCustomers([]); }} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0">
                        <span className="font-bold text-slate-700 block">{c.name}</span>
                        {c.nit && <span className="text-[10px] text-slate-400 font-mono">NIT: {c.nit}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Products Builder */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Package className="w-3 h-3" /> Productos</label>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar productos a vender..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-300 transition bg-slate-50"
              />
              {products.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-100 shadow-xl rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {products.map(p => (
                    <button key={p.id} onClick={() => addToCart(p)} disabled={p.stock <= 0} className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex justify-between items-center group disabled:opacity-50 disabled:cursor-not-allowed">
                      <div>
                        <span className="font-bold text-slate-700 text-sm block group-disabled:text-slate-500">{p.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{p.sku} | Stock: {p.stock}</span>
                      </div>
                      <span className={`text-sm font-bold ${p.stock > 0 ? 'text-purple-700' : 'text-rose-500'}`}>Q{p.price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Items */}
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.id} className="bg-white border text-sm border-slate-100 rounded-xl p-3 flex justify-between items-center shadow-sm">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="font-bold text-slate-800 truncate">{item.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono opacity-80">Q{item.price.toFixed(2)} x {item.quantity}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-slate-50">
                      <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-white rounded text-slate-500"><Minus className="w-3 h-3" /></button>
                      <span className="w-6 text-center font-bold text-[11px]">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-white rounded text-slate-500"><Plus className="w-3 h-3" /></button>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              {cart.length === 0 && <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">El carrito está vacío</p>}
            </div>
          </div>

          <div className="h-px bg-slate-100" />

          {/* Payment Info */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Pago y Facturación</label>
            <div className="space-y-3">
              <div className="flex gap-2">
                {['TRANSFER', 'CARD', 'CASH', 'CREDIT'].map(m => (
                  <button 
                    key={m} 
                    onClick={() => setPaymentMethod(m as 'TRANSFER' | 'CARD' | 'CASH' | 'CREDIT')}
                    className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold border transition ${paymentMethod === m ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {m === 'TRANSFER' ? 'Transferencia' : m === 'CARD' ? 'Tarjeta' : m === 'CASH' ? 'Efectivo' : 'Crédito'}
                  </button>
                ))}
              </div>
              
              {(paymentMethod === 'TRANSFER' || paymentMethod === 'CARD') && (
                <input 
                  value={paymentReference}
                  onChange={e => setPaymentReference(e.target.value)}
                  placeholder="Referencia o voucher (obligatorio)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-300 transition"
                />
              )}
            </div>
          </div>
        </div>

        {/* Totals Footer */}
        <div className="bg-slate-50 p-6 border-t border-slate-100">
          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>Q{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500">
              <span className="flex items-center gap-2">
                Descuento
                <input 
                  type="number" min="0" max="100" 
                  value={discount === 0 ? '' : discount} 
                  onChange={e => setDiscount(Number(e.target.value))}
                  placeholder="%" 
                  className="w-12 h-6 text-center text-xs border border-slate-200 rounded bg-white" 
                />
              </span>
              <span>-Q{(subtotal * (discount / 100)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xl font-black text-slate-800 pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>Q{total.toFixed(2)}</span>
            </div>
          </div>
          <button 
            onClick={handleSubmit}
            disabled={submitting || cart.length === 0}
            className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-lg shadow-purple-600/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Procesar Venta ({cart.length})
          </button>
        </div>

      </div>
    </div>
  );
}
