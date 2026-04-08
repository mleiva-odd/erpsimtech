'use client';

import { useState, useEffect } from 'react';
import { X, FileText, Trash2, ShoppingCart, Loader2 } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';

interface Quote {
  id: string;
  createdAt: string;
  total: number;
  customer?: { id: string; name: string };
  user: { name: string };
  items: any[];
}

interface QuotesModalProps {
  onClose: () => void;
}

export function QuotesModal({ onClose }: QuotesModalProps) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const { addItem, setCustomer, clearCart } = useCartStore();

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sales?status=QUOTE');
      const data = await res.json();
      setQuotes(Array.isArray(data) ? data : data.sales || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, []);

  const loadQuoteIntoCart = (quote: Quote) => {
    clearCart();
    if (quote.customer) setCustomer(quote.customer.id, quote.customer.name);
    
    // Add items
    quote.items.forEach(item => {
      for (let i=0; i<item.quantity; i++) {
         addItem({
            id: item.product.id,
            variantId: item.variant?.id,
            name: item.variant ? `${item.product.name} - ${item.variant.name}` : item.product.name,
            sku: item.variant?.sku || item.product.sku,
            price: Number(item.unitPrice),
            stock: 999 
         });
      }
    });

    onClose();
  };

  const deleteQuote = async (id: string) => {
    if (!confirm('¿Seguro de descartar esta cotización?')) return;
    try {
      await fetch(`/api/sales/${id}`, { method: 'DELETE' });
      fetchQuotes();
    } catch (e) {
      alert('Error eliminando cotización');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-2 text-slate-800">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold">Cotizaciones Guardadas</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
           {loading ? (
             <div className="flex justify-center items-center h-40 text-indigo-600">
               <Loader2 className="w-8 h-8 animate-spin" />
             </div>
           ) : quotes.length === 0 ? (
             <div className="text-center text-slate-500 py-12">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                Ninguna cotización pendiente.
             </div>
           ) : (
             <div className="space-y-3">
               {quotes.map(q => (
                 <div key={q.id} className="border border-slate-200 rounded-xl p-4 flex justify-between items-center hover:border-indigo-200 hover:shadow-md transition-all bg-white group">
                    <div>
                      <div className="font-bold text-slate-800 text-lg mb-1">
                        Cliente: {q.customer?.name || 'Consumidor Final'}
                      </div>
                      <div className="text-sm text-slate-500 flex items-center gap-3 font-medium">
                        <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">ID: {q.id.split('-')[0].toUpperCase()}</span>
                        <span>{new Date(q.createdAt).toLocaleString()}</span>
                        <span>Vend: {q.user?.name}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-2 line-clamp-1 max-w-sm">
                         {q.items.map(i => `${i.quantity}x ${i.product.name}`).join(', ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                       <div className="text-right">
                         <div className="text-[10px] uppercase font-bold text-slate-400">Total Cotizado</div>
                         <div className="font-black text-slate-800 text-xl">Q{Number(q.total).toFixed(2)}</div>
                       </div>
                       <div className="flex flex-col gap-2">
                          <button onClick={() => loadQuoteIntoCart(q)} className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors w-32 shadow-sm">
                             <ShoppingCart className="w-4 h-4"/>
                             Cargar Caja
                          </button>
                          <button onClick={() => deleteQuote(q.id)} className="flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold py-2 px-4 rounded-lg text-sm transition-colors w-32 border border-rose-100">
                             <Trash2 className="w-4 h-4"/>
                             Descartar
                          </button>
                       </div>
                    </div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
