'use client';

/**
 * Fase 22d-5 · SaveAsTemplateModal
 *
 * Modal que captura name+description y guarda los `items`/`metadata` del
 * form actual como una nueva DocumentTemplate.
 *
 * Uso:
 *   <SaveAsTemplateModal
 *     type="RFQ"
 *     items={items}              // items shape de TemplateItem
 *     metadata={metadata ?? null}
 *     onClose={() => setShowSaveTpl(false)}
 *   />
 */

import { useEffect, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import type {
  DocumentTemplateType,
  TemplateItem,
  TemplateMetadata,
} from '@/lib/templates/types';

interface SaveAsTemplateModalProps {
  type: DocumentTemplateType;
  items: TemplateItem[];
  metadata?: TemplateMetadata | null;
  onClose: () => void;
  onSaved?: (templateId: string) => void;
}

export function SaveAsTemplateModal({
  type,
  items,
  metadata,
  onClose,
  onSaved,
}: SaveAsTemplateModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async () => {
    if (busy) return;
    if (!name.trim()) {
      toast({ tone: 'error', message: 'Nombre obligatorio.' });
      return;
    }
    if (items.length === 0) {
      toast({ tone: 'error', message: 'No hay ítems para guardar.' });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          name: name.trim(),
          description: description.trim() || null,
          items,
          metadata: metadata ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          res.status === 409
            ? 'Ya existe una plantilla activa con ese nombre. Renombrá o desactivá la anterior.'
            : (typeof data?.error === 'string' ? data.error : 'No se pudo guardar la plantilla.');
        throw new Error(msg);
      }
      toast({ tone: 'success', message: 'Plantilla guardada.' });
      onSaved?.(typeof data?.id === 'string' ? data.id : '');
      onClose();
    } catch (err) {
      toast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Error al guardar.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Guardar como plantilla"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Guardar como plantilla</h3>
            <p className="text-xs text-slate-500 mt-1">
              {items.length} ítem{items.length === 1 ? '' : 's'} se guardarán para reusar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={busy}
            className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label
              htmlFor="template-name"
              className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-widest"
            >
              Nombre *
            </label>
            <input
              id="template-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Ej. Compra mensual papelería"
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none text-sm focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              aria-label="Nombre de la plantilla"
            />
          </div>
          <div>
            <label
              htmlFor="template-description"
              className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-widest"
            >
              Descripción (opcional)
            </label>
            <textarea
              id="template-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="Cuándo conviene usar esta plantilla..."
              className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none text-sm resize-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              aria-label="Descripción de la plantilla"
            />
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-3 font-bold text-slate-500 bg-slate-50 rounded-xl disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !name.trim()}
            className="flex-1 py-3 font-bold text-white bg-slate-900 rounded-xl shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
