'use client';

/**
 * Fase 22c-5 · Multi-moneda UI · Badge de tipo de cambio del día.
 *
 * Hace fetch a `/api/accounting/exchange-rates/today?currency=XXX` y muestra
 * un chip con el rate vigente:
 *
 *   USD @ Q 7.8500   (verde: ok)
 *   USD @ Q 7.8500   (amber: rate viejo, >7 días)
 *   USD: falta tasa   (rojo: no hay rate cargado, ofrece link a la pantalla)
 *
 * Si la moneda es GTQ (funcional), el badge NO se renderiza (no aplica FX).
 *
 * Props:
 *   - currency: ISO-3 ('USD', 'EUR', etc.).
 *   - onRateLoaded: callback opcional con el rate para que el padre lo use al
 *     submit (snapshot).
 *   - showCaptureLink: si true, muestra link "Capturar tasa" cuando no hay.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, Coins } from 'lucide-react';
import Link from 'next/link';
import { FUNCTIONAL_CURRENCY, normalizeCurrency } from '@/lib/currency';

interface RateInfo {
  rate: number;
  currency: string;
  date: string;
  ageDays: number;
  warning: boolean;
  isFunctional: boolean;
}

interface RateMissing {
  missing: true;
  currency: string;
  suggestedDate: string;
}

type RateState = RateInfo | RateMissing | null;

export interface ExchangeRateBadgeProps {
  currency: string;
  /** Llamado cada vez que se obtiene el rate. `null` si no hay (missing). */
  onRateLoaded?: (rate: number | null) => void;
  /** Mostrar enlace "Capturar tasa" en estado missing. Default true. */
  showCaptureLink?: boolean;
  className?: string;
}

export function ExchangeRateBadge({
  currency,
  onRateLoaded,
  showCaptureLink = true,
  className,
}: ExchangeRateBadgeProps) {
  const normalized = normalizeCurrency(currency);
  const isFunctional = normalized === FUNCTIONAL_CURRENCY;

  const [state, setState] = useState<RateState>(null);
  const [loading, setLoading] = useState(false);

  // Mantener una ref para `onRateLoaded` evita que un padre con lambda inline
  // dispare loops infinitos (la deps de fetchRate cambiarían en cada render).
  const onRateLoadedRef = useRef(onRateLoaded);
  useEffect(() => {
    onRateLoadedRef.current = onRateLoaded;
  }, [onRateLoaded]);

  const fetchRate = useCallback(async () => {
    if (isFunctional) {
      setState(null);
      onRateLoadedRef.current?.(1);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/exchange-rates/today?currency=${normalized}`);
      if (res.status === 404) {
        const body = (await res.json().catch(() => ({}))) as { suggestedDate?: string };
        setState({
          missing: true,
          currency: normalized,
          suggestedDate: body.suggestedDate ?? new Date().toISOString().slice(0, 10),
        });
        onRateLoadedRef.current?.(null);
        return;
      }
      if (!res.ok) {
        setState(null);
        onRateLoadedRef.current?.(null);
        return;
      }
      const data = (await res.json()) as RateInfo;
      setState(data);
      onRateLoadedRef.current?.(data.rate);
    } finally {
      setLoading(false);
    }
  }, [isFunctional, normalized]);

  useEffect(() => {
    void fetchRate();
  }, [fetchRate]);

  if (isFunctional) return null;

  if (loading && !state) {
    return (
      <span
        className={
          className ??
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-400 text-xs font-bold'
        }
        aria-live="polite"
      >
        <Coins className="w-3 h-3 animate-pulse" />
        Cargando tasa…
      </span>
    );
  }

  if (state && 'missing' in state) {
    return (
      <span
        className={
          className ??
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200'
        }
        aria-label={`Falta tipo de cambio para ${state.currency}`}
        role="alert"
      >
        <AlertTriangle className="w-3 h-3" />
        {state.currency}: falta tasa
        {showCaptureLink && (
          <Link
            href="/accounting/exchange-rates"
            className="ml-1 underline underline-offset-2 hover:text-rose-900"
          >
            Capturar
          </Link>
        )}
      </span>
    );
  }

  if (state && 'rate' in state) {
    const tone = state.warning
      ? 'bg-amber-50 text-amber-700 border border-amber-200'
      : 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    return (
      <span
        className={className ?? `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${tone}`}
        aria-label={`Tipo de cambio ${state.currency} a Quetzales: ${state.rate.toFixed(4)}, fecha ${state.date}`}
        title={state.warning ? `Tasa con ${state.ageDays} días de antigüedad — capturá la del día` : `Tasa del ${state.date}`}
      >
        <Coins className="w-3 h-3" />
        {state.currency} @ Q {state.rate.toFixed(4)}
        {state.warning && <span className="ml-0.5 text-[10px] uppercase">({state.ageDays}d)</span>}
      </span>
    );
  }

  return null;
}
