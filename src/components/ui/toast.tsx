'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

type ToastInput = {
  title?: string;
  message: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastItem = Required<Omit<ToastInput, 'title'>> & {
  id: string;
  title: string;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, { accent: string; icon: ReactNode }> = {
  success: {
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-900 shadow-emerald-500/10',
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
  },
  error: {
    accent: 'border-rose-200 bg-rose-50 text-rose-900 shadow-rose-500/10',
    icon: <AlertCircle className="h-5 w-5 text-rose-600" />,
  },
  info: {
    accent: 'border-slate-200 bg-white text-slate-900 shadow-slate-500/10',
    icon: <Info className="h-5 w-5 text-sky-600" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const removeToast = (id: string) => {
    const timer = timers.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete timers.current[id];
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const toast = (input: ToastInput) => {
    const id = crypto.randomUUID();
    const nextToast: ToastItem = {
      id,
      title: input.title?.trim() || '',
      message: input.message,
      tone: input.tone || 'info',
      durationMs: input.durationMs || 3800,
    };

    setToasts((current) => [nextToast, ...current].slice(0, 4));
    timers.current[id] = window.setTimeout(() => removeToast(id), nextToast.durationMs);
  };

  const contextValue = useMemo(() => ({ toast }), []);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-[min(92vw,22rem)] flex-col gap-3">
        {toasts.map((toastItem) => {
          const tone = toneStyles[toastItem.tone];

          return (
            <div
              key={toastItem.id}
              className={`pointer-events-auto rounded-2xl border p-4 shadow-2xl backdrop-blur-sm transition-all duration-300 animate-in fade-in slide-in-from-right-5 ${tone.accent}`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">{tone.icon}</div>
                <div className="min-w-0 flex-1">
                  {toastItem.title && (
                    <p className="text-sm font-bold leading-tight">{toastItem.title}</p>
                  )}
                  <p className={`text-sm ${toastItem.title ? 'mt-0.5' : ''} leading-snug`}>
                    {toastItem.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(toastItem.id)}
                  className="rounded-full p-1 text-slate-400 transition hover:bg-white/70 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}
