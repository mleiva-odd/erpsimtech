/**
 * Fase 21 · Multi-moneda · Cálculo de diferencia cambiaria (FX).
 *
 * Cuando una factura se emite en moneda extranjera (USD/EUR/etc.) y se
 * cobra/paga días después, el tipo de cambio puede haberse movido. La
 * diferencia entre el rate snapshoteado (factura) y el rate del día del
 * cobro/pago genera una ganancia (FX_GAIN, 4.2.01) o pérdida (FX_LOSS,
 * 5.4.01) cambiaria que se registra en partida doble (Fase 14).
 *
 * Convención (perspectiva de la empresa con moneda funcional GTQ):
 *
 *   COLLECTION (cobramos a un cliente que nos debía en moneda extranjera):
 *     - foreignAmount > 0, originalRate = rate al emitir la factura,
 *       currentRate = rate al cobrar.
 *     - Si currentRate > originalRate: la moneda extranjera se apreció →
 *       recibimos MÁS GTQ de los esperados → GAIN.
 *     - Si currentRate < originalRate: la moneda extranjera se depreció →
 *       recibimos MENOS GTQ → LOSS.
 *
 *   PAYMENT (pagamos a un proveedor en moneda extranjera):
 *     - Si currentRate > originalRate: la moneda extranjera se apreció →
 *       pagamos MÁS GTQ que lo provisionado → LOSS.
 *     - Si currentRate < originalRate: pagamos MENOS GTQ → GAIN.
 *
 * Cuando la moneda es funcional (GTQ) o ambos rates son iguales, la
 * diferencia es 0 (sin asiento de FX).
 */

import type { FxDifference, FxOperationSide } from './types';
import { FUNCTIONAL_CURRENCY, type SupportedCurrency } from './types';

/** Redondea a 2 decimales (centavos GTQ). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CalculateFxDifferenceInput {
  /** Rate snapshoteado al emitir el documento original (factura, PO). */
  originalRate: number;
  /** Rate vigente al ejecutar el cobro/pago. */
  currentRate: number;
  /** Monto en la moneda extranjera (no en GTQ). Debe ser positivo. */
  foreignAmount: number;
  /** Lado de la operación. Define el signo: ver convención en cabecera. */
  side: FxOperationSide;
  /** Currency del documento. Si es GTQ funcional, devuelve `{gain:0, loss:0}`. */
  currency?: string | null;
}

/**
 * Calcula la diferencia cambiaria entre el rate original y el actual.
 *
 * @returns `{ gain, loss }` con uno de los dos en 0. Siempre redondeado a
 * 2 decimales. Si no hay diferencia (rate igual, moneda funcional, o
 * inputs inválidos), devuelve `{ gain: 0, loss: 0 }`.
 */
export function calculateFxDifference(
  input: CalculateFxDifferenceInput,
): FxDifference {
  const { originalRate, currentRate, foreignAmount, side } = input;

  // Moneda funcional: no hay diferencia cambiaria.
  if (input.currency && input.currency.trim().toUpperCase() === FUNCTIONAL_CURRENCY) {
    return { gain: 0, loss: 0 };
  }

  // Inputs inválidos → cero defensivo.
  if (
    !Number.isFinite(originalRate) ||
    !Number.isFinite(currentRate) ||
    !Number.isFinite(foreignAmount) ||
    foreignAmount <= 0 ||
    originalRate <= 0 ||
    currentRate <= 0
  ) {
    return { gain: 0, loss: 0 };
  }

  // Diferencia bruta en GTQ: positiva si rate subió.
  const deltaRate = currentRate - originalRate;
  const deltaGtq = round2(foreignAmount * deltaRate);

  if (deltaGtq === 0) {
    return { gain: 0, loss: 0 };
  }

  // Signo según lado:
  //   COLLECTION + delta>0  → GAIN (recibimos más GTQ)
  //   COLLECTION + delta<0  → LOSS
  //   PAYMENT    + delta>0  → LOSS (pagamos más GTQ)
  //   PAYMENT    + delta<0  → GAIN
  if (side === 'COLLECTION') {
    if (deltaGtq > 0) return { gain: deltaGtq, loss: 0 };
    return { gain: 0, loss: Math.abs(deltaGtq) };
  }

  // PAYMENT
  if (deltaGtq > 0) return { gain: 0, loss: deltaGtq };
  return { gain: Math.abs(deltaGtq), loss: 0 };
}

/** Helper liviano: detecta si la moneda es la funcional (string-only). */
export function isFunctional(currency: string | null | undefined): boolean {
  if (!currency) return true;
  return currency.trim().toUpperCase() === FUNCTIONAL_CURRENCY;
}

/** Re-export de currencies para conveniencia. */
export type { SupportedCurrency };
