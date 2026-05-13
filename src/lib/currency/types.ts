/**
 * Fase 21 · Multi-moneda · Tipos compartidos.
 *
 * GTQ es la moneda funcional/reporting para SAT. Toda operación en moneda
 * extranjera se snapshotea con su tipo de cambio del día (Decimal 18,8) y
 * se calcula `functionalAmount = amount × rate` (Decimal 15,2 en GTQ) que
 * es lo que va a los reportes tributarios.
 */

/** Moneda funcional hardcoded para Guatemala (regla legal SAT). */
export const FUNCTIONAL_CURRENCY = 'GTQ' as const;

/** Currencies operacionalmente soportadas en Fase 21. Configurable por empresa. */
export const SUPPORTED_CURRENCIES = ['GTQ', 'USD', 'EUR', 'MXN'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Source de un ExchangeRate. Espejo del enum Prisma `ExchangeRateSource`. */
export type ExchangeRateSourceLiteral = 'MANUAL' | 'BANGUAT' | 'API';

/** Resultado de `calculateFxDifference`. Uno de los dos es 0. */
export interface FxDifference {
  /** Ganancia cambiaria (FX_GAIN, cuenta 4.2.01). 0 si no hay ganancia. */
  gain: number;
  /** Pérdida cambiaria (FX_LOSS, cuenta 5.4.01). 0 si no hay pérdida. */
  loss: number;
}

/**
 * Tipo de operación para `calculateFxDifference`: COLLECTION (cobramos a un
 * cliente que nos debía en moneda extranjera) o PAYMENT (pagamos a un
 * proveedor en moneda extranjera).
 *
 * La lógica de signos depende del lado:
 *   - COLLECTION: rate sube → recibimos más GTQ → GAIN.
 *                 rate baja → recibimos menos GTQ → LOSS.
 *   - PAYMENT:    rate sube → pagamos más GTQ → LOSS.
 *                 rate baja → pagamos menos GTQ → GAIN.
 */
export type FxOperationSide = 'COLLECTION' | 'PAYMENT';
