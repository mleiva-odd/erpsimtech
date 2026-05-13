/**
 * Fase 21 · Multi-moneda · Barrel.
 *
 * Importar desde aquí en endpoints/tests:
 *   import { getExchangeRate, toFunctionalAmount, calculateFxDifference,
 *            FUNCTIONAL_CURRENCY, ExchangeRateError, isFunctional }
 *     from '@/lib/currency';
 */

export {
  FUNCTIONAL_CURRENCY,
  SUPPORTED_CURRENCIES,
} from './types';
export type {
  SupportedCurrency,
  ExchangeRateSourceLiteral,
  FxDifference,
  FxOperationSide,
} from './types';

export {
  getExchangeRate,
  toFunctionalAmount,
  normalizeCurrency,
  isFunctionalCurrency,
  ExchangeRateError,
} from './exchange-rate';

export {
  calculateFxDifference,
  isFunctional,
} from './fx-difference';
export type { CalculateFxDifferenceInput } from './fx-difference';
