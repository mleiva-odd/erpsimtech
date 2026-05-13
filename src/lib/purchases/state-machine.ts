/**
 * Fase 19 · Máquina de estados de PurchaseOrder.
 *
 * Estados (enum PurchaseStatus en Prisma):
 *
 *   DRAFT
 *     └─→ PENDING_APPROVAL  (si total > threshold y workflow requiere aprobación)
 *     └─→ APPROVED          (si total ≤ threshold y no requiere aprobación)
 *     └─→ CANCELLED
 *
 *   PENDING_APPROVAL
 *     └─→ APPROVED          (aprobación manual con permiso purchases:approve)
 *     └─→ CANCELLED
 *
 *   APPROVED
 *     └─→ PARTIALLY_RECEIVED (primer GRN parcial)
 *     └─→ RECEIVED           (GRN completo)
 *     └─→ CANCELLED
 *
 *   PARTIALLY_RECEIVED
 *     └─→ PARTIALLY_RECEIVED (siguiente GRN parcial)
 *     └─→ RECEIVED           (GRN que completa la PO)
 *     └─→ CANCELLED          (si no se generó SupplierInvoice)
 *
 *   RECEIVED
 *     └─→ INVOICED           (al registrar SupplierInvoice)
 *     └─→ CANCELLED          (si no se generó SupplierInvoice)
 *
 *   INVOICED
 *     └─→ CANCELLED          (solo si no se hicieron pagos al payable)
 *
 *   COMPLETED                 (estado legacy del flujo "fast" pre-Fase 19;
 *                              equivalente a INVOICED a efectos de transición)
 *     └─→ CANCELLED
 *
 *   CANCELLED                 (terminal)
 *
 * El helper expone:
 *  - `canTransition(from, to)`: para que el handler valide antes de UPDATE.
 *  - `nextStatusAfterReception(po)`: helper para decidir RECEIVED vs
 *    PARTIALLY_RECEIVED dado el progreso de cada ítem (quantityReceived vs
 *    quantity).
 */

/**
 * Tipo local: NO importamos `PurchaseStatus` de `@prisma/client` porque el
 * cliente Prisma del sandbox no tiene los valores nuevos generados todavía
 * (Fase 19 ALTER TYPE pendiente de prisma generate). El tipo local cubre
 * los valores reales del schema actual.
 */
export type PurchaseStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'INVOICED'
  | 'COMPLETED'
  | 'CANCELLED';

/** Transiciones legales (mapa estado_origen → set de destinos). */
const TRANSITIONS: Record<PurchaseStatus, Set<PurchaseStatus>> = {
  DRAFT: new Set<PurchaseStatus>(['PENDING_APPROVAL', 'APPROVED', 'CANCELLED']),
  PENDING_APPROVAL: new Set<PurchaseStatus>(['APPROVED', 'CANCELLED']),
  APPROVED: new Set<PurchaseStatus>([
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED',
  ]),
  PARTIALLY_RECEIVED: new Set<PurchaseStatus>([
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED',
  ]),
  RECEIVED: new Set<PurchaseStatus>(['INVOICED', 'CANCELLED']),
  INVOICED: new Set<PurchaseStatus>(['CANCELLED']),
  COMPLETED: new Set<PurchaseStatus>(['CANCELLED']),
  CANCELLED: new Set<PurchaseStatus>(),
};

/** ¿Es legal pasar de `from` a `to`? Self-loop solo si está explícito. */
export function canTransition(from: PurchaseStatus, to: PurchaseStatus): boolean {
  return TRANSITIONS[from].has(to);
}

/** Lanza con mensaje legible si la transición no es válida. */
export function assertTransition(from: PurchaseStatus, to: PurchaseStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transición inválida ${from} → ${to}.`);
  }
}

/**
 * Estados en los que el GRN está permitido. (PARTIALLY_RECEIVED no se incluye
 * porque la API debe avanzar status secuencialmente: APPROVED → PR/RECEIVED
 * → INVOICED; pero un siguiente GRN sobre una PO que ya es PARTIALLY_RECEIVED
 * sí está permitido — lo validamos por separado.)
 */
export const STATES_ACCEPTING_GRN: PurchaseStatus[] = [
  'APPROVED',
  'PARTIALLY_RECEIVED',
];

/** Estados en los que se puede registrar SupplierInvoice. */
export const STATES_ACCEPTING_INVOICE: PurchaseStatus[] = [
  'RECEIVED',
  'PARTIALLY_RECEIVED', // permitir invoice parcial post-GRN parcial
];

/**
 * Dado el progreso por ítem (quantityReceived acumulado y quantity total),
 * decide si el GRN avanza la PO a:
 *  - 'RECEIVED'           (si TODAS las líneas alcanzan quantity)
 *  - 'PARTIALLY_RECEIVED' (si al menos UNA línea no llegó al total)
 *
 * El delta del GRN actual ya debe estar acumulado en `received` antes de
 * llamar — el caller suma `quantityReceived` previo + delta nuevo.
 */
export function nextStatusAfterReception(
  items: Array<{ quantity: number; received: number }>,
): 'RECEIVED' | 'PARTIALLY_RECEIVED' {
  const TOL = 0.001;
  const allComplete = items.every((it) => it.received + TOL >= it.quantity);
  return allComplete ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
}
