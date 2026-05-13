/**
 * Fase 19 · API pública del módulo de compras enterprise.
 *
 * - retention: cálculo de retenciones IVA y ISR a proveedores.
 * - landed-cost: prorrateo de costos accesorios al inventario.
 * - state-machine: transiciones legales de PurchaseStatus.
 * - accounting: construcción de líneas de JournalEntry para SupplierInvoice.
 */

export {
  calculateRetention,
  suggestedIsrRate,
  IVA_RETENTION_PC_RATE,
  IVA_RETENTION_GENERAL_RATE,
  ISR_RATE_TRAMO_I,
  ISR_RATE_TRAMO_II,
  ISR_TRAMO_THRESHOLD_MONTHLY,
} from './retention';
export type { RetentionInput, RetentionResult } from './retention';

export { prorateLandedCost } from './landed-cost';
export type {
  PurchaseLineForLanding,
  ProratedLandingResult,
} from './landed-cost';

export {
  canTransition,
  assertTransition,
  nextStatusAfterReception,
  STATES_ACCEPTING_GRN,
  STATES_ACCEPTING_INVOICE,
} from './state-machine';

export { buildSupplierInvoiceJournalLines } from './accounting';
export type { SupplierInvoiceJournalInput } from './accounting';
