'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

type ConfirmTone = 'danger' | 'warning' | 'info';

type ConfirmInput = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  /**
   * Alias semántico para callers acostumbrados a shadcn / radix.
   * Si se pasa 'destructive' se mapea a tone='danger'.
   */
  variant?: 'default' | 'destructive';
  /**
   * Si se setea, el botón confirmar queda deshabilitado hasta que el usuario
   * escriba exactamente este string. Útil para acciones muy destructivas
   * (ej. anular factura → typing="ANULAR").
   */
  requireTyping?: string;
};

type ConfirmContextValue = {
  confirm: (input: ConfirmInput) => Promise<boolean>;
};

type PendingConfirm = {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  tone: ConfirmTone;
  requireTyping?: string;
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

function resolveTone(input: ConfirmInput): ConfirmTone {
  if (input.variant === 'destructive') return 'danger';
  return input.tone || 'danger';
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [typedValue, setTypedValue] = useState<string>('');

  const confirm = (input: ConfirmInput) => {
    return new Promise<boolean>((resolve) => {
      setTypedValue('');
      setPending({
        title: input.title,
        message: input.message,
        confirmText: input.confirmText || 'Confirmar',
        cancelText: input.cancelText || 'Cancelar',
        tone: resolveTone(input),
        requireTyping: input.requireTyping,
        resolve,
      });
    });
  };

  const close = (value: boolean) => {
    if (!pending) return;
    pending.resolve(value);
    setPending(null);
    setTypedValue('');
  };

  const contextValue = useMemo(() => ({ confirm }), []);

  const typingRequired = pending?.requireTyping;
  const confirmEnabled = !typingRequired || typedValue === typingRequired;

  return (
    <ConfirmContext.Provider value={contextValue}>
      {children}

      {pending && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  pending.tone === 'danger'
                    ? 'bg-rose-50 text-rose-600'
                    : pending.tone === 'warning'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-sky-50 text-sky-600'
                }`}>
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{pending.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{pending.message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => close(false)}
                aria-label="Cerrar"
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {typingRequired && (
              <div className="mt-5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Escribe <span className="font-mono text-rose-600">{typingRequired}</span> para confirmar
                </label>
                <input
                  type="text"
                  autoFocus
                  value={typedValue}
                  onChange={(e) => setTypedValue(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  aria-label={`Escribe ${typingRequired} para confirmar`}
                />
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => close(false)}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
              >
                {pending.cancelText}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                disabled={!confirmEnabled}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold text-white transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  pending.tone === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : pending.tone === 'warning'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-sky-600 hover:bg-sky-700'
                }`}
              >
                {pending.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);

  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }

  return context;
}
