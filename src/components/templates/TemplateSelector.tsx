'use client';

/**
 * Fase 22d-5 · TemplateSelector
 *
 * Botón + modal/dropdown que lista las plantillas activas del tipo solicitado
 * y permite "aplicar" una. Lazy-fetch al abrir.
 *
 * Uso:
 *   <TemplateSelector
 *     type="RFQ"
 *     onApply={(items, metadata) => { ... aplicar al form padre ... }}
 *   />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCopy, Loader2, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import type {
  DocumentTemplateType,
  TemplateItem,
  TemplateMetadata,
} from '@/lib/templates/types';

interface TemplateSummary {
  id: string;
  type: DocumentTemplateType;
  name: string;
  description: string | null;
  items: TemplateItem[];
  metadata: TemplateMetadata | null;
  createdBy?: { id: string; name: string | null } | null;
  createdAt: string;
}

interface TemplateSelectorProps {
  type: DocumentTemplateType;
  onApply: (items: TemplateItem[], metadata: TemplateMetadata | null) => void;
  /** Label personalizable del botón. Default: "Usar plantilla". */
  buttonLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function TemplateSelector({
  type,
  onApply,
  buttonLabel = 'Usar plantilla',
  disabled,
  className,
}: TemplateSelectorProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const fetched = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/templates?type=${encodeURIComponent(type)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'No se pudieron cargar las plantillas.');
      }
      const list = Array.isArray(data?.templates) ? (data.templates as TemplateSummary[]) : [];
      setTemplates(list);
      fetched.current = true;
    } catch (err) {
      toast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Error al cargar plantillas.',
      });
    } finally {
      setLoading(false);
    }
  }, [type, toast]);

  // Cuando se abre y todavía no se cargó, dispara el fetch. Lo manejamos en
  // el handler de click del botón (no en un effect) para no violar
  // react-hooks/set-state-in-effect.
  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    if (!fetched.current) void load();
  };

  const handleApply = (tpl: TemplateSummary) => {
    if (!Array.isArray(tpl.items) || tpl.items.length === 0) {
      toast({ tone: 'error', message: 'La plantilla no tiene ítems aplicables.' });
      return;
    }
    onApply(tpl.items, tpl.metadata ?? null);
    setOpen(false);
    toast({ tone: 'success', message: `Plantilla "${tpl.name}" aplicada.` });
  };

  // Cierre con ESC para a11y.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        aria-label={buttonLabel}
        className={
          className ??
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition disabled:opacity-50'
        }
      >
        <ClipboardCopy className="w-3.5 h-3.5" />
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Selector de plantillas"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Aplicar plantilla</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Reemplaza los ítems actuales con los de la plantilla seleccionada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 flex-1 overflow-auto">
              {loading ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <p className="text-xs">Cargando plantillas...</p>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-slate-500">
                    Aún no tenés plantillas de este tipo.
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Tip: guardá un documento como plantilla desde el botón
                    &quot;Guardar como plantilla&quot;.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {templates.map((tpl) => {
                    const count = Array.isArray(tpl.items) ? tpl.items.length : 0;
                    return (
                      <li
                        key={tpl.id}
                        className="border border-slate-100 rounded-xl p-3 flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">
                              {tpl.name}
                            </p>
                            {tpl.description && (
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {tpl.description}
                              </p>
                            )}
                            <p className="text-[10px] text-slate-400 mt-1">
                              {count} ítem{count === 1 ? '' : 's'}
                              {tpl.createdBy?.name ? ` · por ${tpl.createdBy.name}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleApply(tpl)}
                            aria-label={`Aplicar plantilla ${tpl.name}`}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition shrink-0"
                          >
                            Aplicar
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
