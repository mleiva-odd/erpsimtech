'use client';

import { useEffect, useState } from 'react';
import { X, Printer, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface DeliveryNoteModalProps {
  noteId: string;
  onClose: () => void;
}

interface NoteData {
  id: string;
  noteNumber: string | null;
  recipientName: string;
  address: string;
  phone: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  customer: { name: string; phone?: string | null; address?: string | null } | null;
  user: { name: string };
  sale: { id: string; total: number; invoiceNumber?: string | null } | null;
  branch: { name: string; address?: string | null; phone?: string | null } | null;
  company: { name: string; logoUrl?: string | null; phone?: string | null } | null;
  items: Array<{
    id: string;
    quantity: number;
    product: { name: string; sku: string };
    variant: { name: string } | null;
  }>;
}

interface SettingsData {
  storeName?: string;
  address?: string;
  phone?: string;
}

export function DeliveryNoteModal({ noteId, onClose }: DeliveryNoteModalProps) {
  const [note, setNote] = useState<NoteData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadData() {
      setIsLoading(true);
      try {
        const [noteRes, setRes] = await Promise.all([
          fetch(`/api/delivery-notes/${noteId}`),
          fetch('/api/settings'),
        ]);
        const noteJson = await noteRes.json();
        const setJson = await setRes.json();

        if (!active) return;
        if (noteRes.ok) setNote(noteJson);
        if (!setJson.error) setSettings(setJson);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadData();
    return () => { active = false; };
  }, [noteId]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!note) return null;

  const storeName = note.company?.name || settings?.storeName || 'Mi Empresa';
  const storeAddress = note.branch?.address || settings?.address || '';
  const storePhone = note.company?.phone || settings?.phone || '';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm print:bg-white print:backdrop-blur-none p-4">
      <div className="absolute top-8 right-8 flex gap-4 print:hidden">
        <button
          onClick={handlePrint}
          className="bg-sky-600 hover:bg-sky-700 text-white px-6 py-3.5 rounded-2xl font-bold shadow-xl shadow-sky-500/20 flex items-center gap-2.5 transition-all hover:scale-[1.02] active:scale-95 text-sm"
        >
          <Printer className="w-5 h-5" /> Imprimir Nota de Envío
        </button>
        <button
          onClick={onClose}
          className="bg-slate-900 hover:bg-black text-white p-3.5 rounded-2xl shadow-xl flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="bg-white p-6 w-full max-w-[80mm] min-h-[50vh] shadow-xl text-black font-mono text-sm print:shadow-none print:w-[80mm] print:m-0 print:p-0">
        {/* Store Header */}
        <div className="text-center mb-4">
          <h2 className="font-bold text-xl uppercase mb-1">{storeName}</h2>
          {storeAddress && <p className="text-xs">{storeAddress}</p>}
          {storePhone && <p className="text-xs">Tel: {storePhone}</p>}

          <div className="mt-3 border-2 border-black py-1 px-2 text-sm font-bold uppercase">
            NOTA DE ENVÍO
          </div>
        </div>

        {/* Note Info */}
        <div className="border-b border-dashed border-slate-400 pb-3 mb-3 text-xs space-y-0.5">
          <p className="flex justify-between">
            <span>No:</span>
            <span className="font-bold">{note.noteNumber || '-'}</span>
          </p>
          <p className="flex justify-between">
            <span>Fecha:</span>
            <span>{format(new Date(note.createdAt), 'dd/MM/yyyy HH:mm', { locale: es })}</span>
          </p>
          {note.sale && (
            <p className="flex justify-between">
              <span>Venta Ref:</span>
              <span>#{note.sale.id.split('-')[0].toUpperCase()}</span>
            </p>
          )}
          <p className="flex justify-between">
            <span>Preparó:</span>
            <span>{note.user?.name}</span>
          </p>
          {note.branch && (
            <p className="flex justify-between">
              <span>Sucursal:</span>
              <span>{note.branch.name}</span>
            </p>
          )}
        </div>

        {/* Recipient */}
        <div className="border-b border-dashed border-slate-400 pb-3 mb-3 text-xs">
          <p className="font-bold mb-1 uppercase text-[10px]">Destinatario:</p>
          <p className="text-sm font-bold">{note.recipientName}</p>
          <p className="mt-1">{note.address}</p>
          {note.phone && <p className="mt-0.5">Tel: {note.phone}</p>}
          {note.notes && (
            <p className="mt-2 pt-1 border-t border-dotted border-slate-300 italic">
              {note.notes}
            </p>
          )}
        </div>

        {/* Items Table */}
        <table className="w-full text-xs mb-4">
          <thead>
            <tr className="border-b border-dashed border-slate-400">
              <th className="text-left font-bold py-1 w-10">Cant</th>
              <th className="text-left font-bold py-1">Producto</th>
            </tr>
          </thead>
          <tbody>
            {note.items.map((item) => (
              <tr key={item.id} className="border-b border-dotted border-slate-200">
                <td className="py-1.5 align-top font-bold text-sm">{item.quantity}</td>
                <td className="py-1.5 align-top pl-1">
                  <div>{item.product.name}</div>
                  {item.variant && (
                    <div className="text-[10px] text-slate-500 font-medium">
                      {item.variant.name}
                    </div>
                  )}
                  <div className="text-[9px] text-slate-400">{item.product.sku}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-xs font-bold text-right mb-6">
          Total Artículos: {note.items.reduce((s, i) => s + i.quantity, 0)}
        </div>

        {/* Signature */}
        <div className="mt-10 space-y-8 text-center text-[10px]">
          <div>
            <div className="border-b border-black w-3/4 mx-auto mb-1"></div>
            <p>Entregado por</p>
          </div>
          <div>
            <div className="border-b border-black w-3/4 mx-auto mb-1"></div>
            <p>Recibido por</p>
          </div>
        </div>
      </div>
    </div>
  );
}
