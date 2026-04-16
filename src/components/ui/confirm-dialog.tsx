'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

type ConfirmInput = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'warning' | 'info';
};

type ConfirmContextValue = {
  confirm: (input: ConfirmInput) => Promise<boolean>;
};

type PendingConfirm = ConfirmInput & {
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = (input: ConfirmInput) => {
    return new Promise<boolean>((resolve) => {
      setPending({
        title: input.title,
        message: input.message,
        confirmText: input.confirmText || 'Confirmar',
        cancelText: input.cancelText || 'Cancelar',
        tone: input.tone || 'danger',
        resolve,
      });
    });
  };

  const close = (value: boolean) => {
    if (!pending) return;
    pending.resolve(value);
    setPending(null);
  };

  const contextValue = useMemo(() => ({ confirm }), []);

  return (
    <ConfirmContext.Provider value={contextValue}>
      {children}

      {pending && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  pending.tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
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
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

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
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold text-white transition ${
                  pending.tone === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-amber-600 hover:bg-amber-700'
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
