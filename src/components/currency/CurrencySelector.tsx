'use client';

/**
 * Fase 22c-5 · Multi-moneda UI · Selector de moneda.
 *
 * Componente reutilizable para elegir la moneda de un documento (Sale, PO,
 * Quote, etc.). Default GTQ (moneda funcional, regla legal Guatemala).
 *
 * Lista hardcoded de monedas habilitadas: GTQ + USD por defecto. En Fase 24
 * se planea agregar `Company.enabledCurrencies` para personalizarlo por
 * empresa (deuda anotada en CLAUDE / agents).
 *
 * Props:
 *   - value: moneda actual (ISO-3, ej. 'GTQ').
 *   - onChange: callback con la nueva moneda.
 *   - disabled / id / className: passthrough nativo.
 *
 * A11y: `aria-label` configurable; default "Seleccionar moneda".
 */

import { FUNCTIONAL_CURRENCY } from '@/lib/currency';

export const DEFAULT_ENABLED_CURRENCIES = ['GTQ', 'USD'] as const;

export interface CurrencySelectorProps {
  value: string;
  onChange: (next: string) => void;
  /** Currencies disponibles. Default ['GTQ', 'USD']. */
  enabled?: readonly string[];
  disabled?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
}

export function CurrencySelector({
  value,
  onChange,
  enabled = DEFAULT_ENABLED_CURRENCIES,
  disabled = false,
  className,
  id,
  ariaLabel = 'Seleccionar moneda',
}: CurrencySelectorProps) {
  const safeValue = enabled.includes(value) ? value : FUNCTIONAL_CURRENCY;

  return (
    <select
      id={id}
      value={safeValue}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={
        className ??
        'px-3 py-2 border-2 border-slate-100 rounded-xl outline-none text-sm bg-white font-mono font-bold disabled:bg-slate-50 disabled:text-slate-400'
      }
    >
      {enabled.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
