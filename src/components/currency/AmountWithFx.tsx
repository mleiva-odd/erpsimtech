'use client';

/**
 * Fase 22c-5 · Multi-moneda UI · Monto con su equivalente funcional.
 *
 * Renderiza:
 *   - Si currency === GTQ → solo "Q 123.45".
 *   - Si currency != GTQ → "USD 100.00" (primario) + "Q 785.00" (debajo, gris).
 *
 * Props:
 *   - amount: monto en la moneda original (number o string Decimal).
 *   - currency: ISO-3.
 *   - functionalAmount: opcional. Si no se provee, se calcula como
 *     amount × exchangeRate.
 *   - exchangeRate: opcional. Solo se usa si no hay `functionalAmount` y no
 *     es GTQ.
 *   - size: 'sm' | 'md' | 'lg' para variar tipografía. Default 'md'.
 *   - className: passthrough.
 */

import { FUNCTIONAL_CURRENCY, normalizeCurrency } from '@/lib/currency';

export interface AmountWithFxProps {
  amount: number | string;
  currency?: string | null;
  functionalAmount?: number | string | null;
  exchangeRate?: number | string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatAmount(amount: number, currency: string): string {
  const n = amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === FUNCTIONAL_CURRENCY) return `Q ${n}`;
  return `${currency} ${n}`;
}

export function AmountWithFx({
  amount,
  currency,
  functionalAmount,
  exchangeRate,
  size = 'md',
  className,
}: AmountWithFxProps) {
  const cur = normalizeCurrency(currency);
  const amt = toNum(amount);
  const isFunctional = cur === FUNCTIONAL_CURRENCY;

  const mainSize =
    size === 'lg' ? 'text-2xl font-bold' : size === 'sm' ? 'text-sm font-semibold' : 'text-base font-bold';
  const subSize =
    size === 'lg' ? 'text-sm' : size === 'sm' ? 'text-[10px]' : 'text-xs';

  if (isFunctional) {
    return (
      <span className={className ?? `${mainSize} text-slate-800 tabular-nums`}>
        {formatAmount(amt, cur)}
      </span>
    );
  }

  let functional: number | null = null;
  if (functionalAmount != null && functionalAmount !== '') {
    functional = toNum(functionalAmount);
  } else if (exchangeRate != null && exchangeRate !== '') {
    functional = Math.round(amt * toNum(exchangeRate) * 100) / 100;
  }

  return (
    <span className={className ?? 'inline-flex flex-col items-end leading-tight tabular-nums'}>
      <span className={`${mainSize} text-slate-800`}>{formatAmount(amt, cur)}</span>
      {functional != null && (
        <span className={`${subSize} text-slate-400 font-medium`} aria-label="Equivalente en Quetzales">
          ≈ {formatAmount(functional, FUNCTIONAL_CURRENCY)}
        </span>
      )}
    </span>
  );
}
