'use client';

import { useState } from 'react';
import { X, Truck, Send, Loader2, MapPin, User, Phone, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useRouter } from 'next/navigation';

interface SaleItem {
  productId: string;
  variantId: string | null;
  quantity: number;
}

interface CreateDeliveryNoteModalProps {
  saleId: string;
  customerName?: string;
  items: SaleItem[];
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateDeliveryNoteModal({ saleId, customerName, items, onClose, onSuccess }: CreateDeliveryNoteModalProps) {
  const { toast } = useToast();
  const router = useRouter();
  
  const [loading, setLoading] = useState(false);
  const [recipientName, setRecipientName] = useState(customerName || '');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim() || !recipientName.trim()) {
      toast({ tone: 'error', message: 'El nombre y la dirección son requeridos.' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        saleId,
        recipientName: recipientName.trim(),
        address: address.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        items
      };

      const res = await fetch('/api/delivery-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear la nota');

      toast({ tone: 'success', message: 'Nota de envío generada con éxito' });
      if (onSuccess) onSuccess();
      onClose();
      router.push('/sales/delivery-notes');
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Error de servidor' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sky-700">
            <Truck className="w-5 h-5" />
            <h2 className="font-bold text-lg">Generar Nota de Envío</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Recibe</label>
            <input
              type="text"
              required
              value={recipientName}
              onChange={e => setRecipientName(e.target.value)}
              placeholder="Nombre de quien recibe"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none transition"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Dirección de Entrega</label>
            <textarea
              required
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Avenida, calle, zona, referencias..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none transition resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Teléfono</label>
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none transition"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Instrucciones adicionales</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="E.j. Llevar cambio, llamar al llegar..."
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-sky-300 focus:ring-1 focus:ring-sky-200 outline-none transition"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 font-bold text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Generar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
