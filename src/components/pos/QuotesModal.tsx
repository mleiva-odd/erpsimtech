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
  const [error, setError] = useState('');
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);
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
    try {
      const res = await fetch(`/api/sales/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No fue posible descartar la cotización.');
      }
      setQuoteToDelete(null);
      fetchQuotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminando cotización');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh] border border-slate-100 animate-in fade-in zoom-in duration-300">
        <div className="px-8 pt-8 pb-4 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Cotizaciones Guardadas</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Gestión de Presupuestos Pendientes</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
           {error && (
             <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
               {error}
             </div>
           )}
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
             <div className="space-y-4">
               {quotes.map(q => (
                 <div key={q.id} className="group bg-white border border-slate-100 rounded-[1.5rem] p-6 flex justify-between items-center hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300">
                   <div className="flex-1 min-w-0 pr-4">
                     <div className="flex items-center gap-2 mb-1">
                       <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                       <h3 className="font-bold text-slate-800 text-lg truncate">
                         {q.customer?.name || 'Consumidor Final'}
                       </h3>
                     </div>
                     <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <span className="bg-slate-50 text-slate-500 px-2 py-0.5 rounded-lg border border-slate-100">#{q.id.split('-')[0]}</span>
                        <span className="flex items-center gap-1.5"><FileText className="w-3 h-3"/> {new Date(q.createdAt).toLocaleDateString()}</span>
                        <span>Operador: {q.user?.name}</span>
                     </div>
                     <div className="text-xs text-slate-400 mt-3 line-clamp-1 italic">
                        {q.items.map(i => `${i.quantity}x ${i.product.name}`).join(', ')}
                     </div>
                   </div>
                   <div className="flex items-center gap-8 border-l border-slate-100 pl-8">
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">Presupuesto</p>
                        <p className="font-bold text-slate-900 text-2xl tracking-tight">Q{Number(q.total).toFixed(2)}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                         <button 
                           onClick={() => loadQuoteIntoCart(q)} 
                           className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-all w-36 shadow-lg shadow-blue-500/20 active:scale-95"
                         >
                            <ShoppingCart className="w-4 h-4"/>
                            REANUDAR
                         </button>
                         <button 
                           onClick={() => setQuoteToDelete(q)} 
                           className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 font-bold py-2.5 px-5 rounded-xl text-xs transition-all w-36 border border-transparent hover:border-rose-100 uppercase"
                         >
                            <Trash2 className="w-3.5 h-3.5"/>
                            DESCARTAR
                         </button>
                      </div>
                   </div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>

      {quoteToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Descartar cotización</h3>
            <p className="mt-2 text-sm text-slate-500">
              Esta acción eliminará la cotización #{quoteToDelete.id.split('-')[0].toUpperCase()}.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setQuoteToDelete(null)}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteQuote(quoteToDelete.id)}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-700"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
