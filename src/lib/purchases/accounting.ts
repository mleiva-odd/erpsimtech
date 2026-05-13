/**
 * Fase 19 · Generación de asientos contables del flujo de compras.
 *
 * Decisión pragmática:
 *  - PO (compromiso): NO genera asiento.
 *  - GRN (recepción): NO genera asiento; solo mueve stock (vía
 *    recordStockMovement). El stock queda registrado a costo (Decimal).
 *  - SupplierInvoice (registro de factura): genera el asiento doble que
 *    captura la realidad fiscal y contable de la compra.
 *
 * Asiento del SupplierInvoice (orden de cuentas):
 *
 *   DR Inventario               por subtotal SI todas las líneas son
 *                               productos inventariables (caso default GT).
 *
 *      Si la compra es de servicios (sin movimiento de stock), DR Gastos
 *      Operativos por subtotal.
 *
 *   DR IVA Crédito Fiscal       por tax (solo si proveedor es GENERAL).
 *                               PC no genera IVA crédito (el 5% lo paga el
 *                               vendedor a SAT, no se acredita).
 *
 *   CR Proveedores              por total = subtotal + tax - withheldIVA - withheldISR
 *                               (lo que efectivamente se le debe al proveedor).
 *
 *   CR IVA Débito Fiscal        por withheldIVA  (retención IVA — la empresa
 *                               la debe al fisco hasta declararla).
 *
 *   CR ISR Retenido por Pagar   por withheldISR  (retención ISR — idem).
 *
 * Validación: Σ DR == Σ CR (createJournalEntry valida con tolerancia 0.005).
 *
 *
 * El helper devuelve `lines: JournalLineInput[]` para componer el asiento.
 * El caller hace el `createJournalEntry(tx, { ..., lines })` dentro de la
 * transacción del registro de factura.
 */

import type { JournalLineInput } from '@/lib/accounting';
import { ACCOUNTS } from '@/lib/accounting';

export interface SupplierInvoiceJournalInput {
  /** Suma de los subtotales de las líneas (sin IVA). */
  subtotal: number;
  /** IVA débito de la factura (0 si proveedor PC o exento). */
  tax: number;
  /** Retención IVA al proveedor (5% PC o 15% Agente). */
  withheldIVA: number;
  /** Retención ISR al proveedor (5% o 7%). */
  withheldISR: number;
  /**
   * Si TODAS las líneas son inventario (productos físicos), el DR va a
   * Inventario (1.2.01). Si la compra es de servicios o gastos, el DR va a
   * Gastos Operativos (5.3.01). Default `true`.
   */
  isInventoryPurchase?: boolean;
  /** Descripción para las líneas del asiento (auditoría). */
  description?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Construye las líneas del asiento contable del SupplierInvoice.
 *
 * Retorna un array `JournalLineInput[]` que el caller pasa a
 * `createJournalEntry(tx, { ..., lines })`.
 *
 * Reglas:
 *  - Si tax > 0, asumimos régimen GENERAL del proveedor → DR IVA Crédito.
 *  - Si withheldIVA > 0, agregamos CR IVA Débito Fiscal.
 *  - Si withheldISR > 0, agregamos CR ISR Retenido por Pagar.
 *  - El CR Proveedores siempre va por el TOTAL (subtotal + tax - withholds).
 *
 * Balance verificable:
 *   DR (subtotal + tax) == CR (total + withheldIVA + withheldISR)
 *   donde total = subtotal + tax - withheldIVA - withheldISR
 *   ergo CR = (subtotal + tax - withheldIVA - withheldISR) + withheldIVA + withheldISR = subtotal + tax. OK.
 */
export function buildSupplierInvoiceJournalLines(
  input: SupplierInvoiceJournalInput,
): JournalLineInput[] {
  const subtotal = round2(Number(input.subtotal) || 0);
  const tax = round2(Number(input.tax) || 0);
  const withheldIVA = round2(Number(input.withheldIVA) || 0);
  const withheldISR = round2(Number(input.withheldISR) || 0);
  const total = round2(subtotal + tax - withheldIVA - withheldISR);

  const isInventory = input.isInventoryPurchase !== false; // default true
  const desc = input.description ?? 'Factura proveedor';

  const lines: JournalLineInput[] = [];

  // DR principal por el subtotal (inventario o gasto operativo).
  if (subtotal > 0) {
    lines.push({
      accountCode: isInventory ? ACCOUNTS.INVENTORY : ACCOUNTS.OPERATING_EXPENSES,
      debit: subtotal,
      description: `${desc} — ${isInventory ? 'Inventario' : 'Gasto'} (subtotal)`,
    });
  }

  // DR IVA crédito fiscal (solo si hay IVA débito en la factura).
  if (tax > 0) {
    lines.push({
      accountCode: ACCOUNTS.VAT_INPUT,
      debit: tax,
      description: `${desc} — IVA Crédito Fiscal`,
    });
  }

  // CR Cuentas por Pagar a Proveedores por el total neto.
  if (total > 0) {
    lines.push({
      accountCode: ACCOUNTS.AP,
      credit: total,
      description: `${desc} — Proveedores`,
    });
  }

  // CR IVA Débito Fiscal por la retención de IVA al proveedor.
  if (withheldIVA > 0) {
    lines.push({
      accountCode: ACCOUNTS.VAT_OUTPUT,
      credit: withheldIVA,
      description: `${desc} — Retención IVA`,
    });
  }

  // CR ISR Retenido por Pagar por la retención de ISR al proveedor.
  if (withheldISR > 0) {
    lines.push({
      accountCode: ACCOUNTS.ISR_PAYABLE,
      credit: withheldISR,
      description: `${desc} — Retención ISR`,
    });
  }

  return lines;
}
