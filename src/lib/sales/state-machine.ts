/**
 * Máquina de estados de `Sale` (Fase 20).
 *
 * Ciclo enterprise:
 *   QUOTE ─accept→ ORDER ─deliver(parcial)→ PARTIALLY_DELIVERED ─deliver(resto)→ DELIVERED ─invoice→ INVOICED
 *   QUOTE ─cancel→ CANCELLED
 *   ORDER ─cancel-order→ CANCELLED
 *   PARTIALLY_DELIVERED ─cancel-order→ CANCELLED
 *
 * Ciclo POS legacy (todo en un paso): se crea directamente en COMPLETED.
 *   COMPLETED ─cancel→ CANCELLED
 *
 * El estado OVERDUE (Fase 17) puede convivir con INVOICED/COMPLETED si la
 * venta tiene crédito y vence; lo regula el cron, no esta máquina.
 */

export type SaleStateCode =
  | 'QUOTE'
  | 'ORDER'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'INVOICED'
  | 'COMPLETED'
  | 'PENDING'
  | 'OVERDUE'
  | 'CANCELLED';

const ALLOWED: Record<SaleStateCode, SaleStateCode[]> = {
  QUOTE: ['ORDER', 'CANCELLED'],
  ORDER: ['PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'],
  PARTIALLY_DELIVERED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['INVOICED', 'CANCELLED'],
  INVOICED: ['CANCELLED', 'OVERDUE'],
  COMPLETED: ['CANCELLED', 'OVERDUE'],
  PENDING: ['COMPLETED', 'CANCELLED'],
  OVERDUE: ['INVOICED', 'COMPLETED', 'CANCELLED'],
  CANCELLED: [],
};

export function canTransitionSale(from: SaleStateCode, to: SaleStateCode): boolean {
  if (from === to) return true; // idempotencia
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertTransition(from: SaleStateCode, to: SaleStateCode): void {
  if (!canTransitionSale(from, to)) {
    throw new Error(`Transición no permitida: ${from} → ${to}`);
  }
}
