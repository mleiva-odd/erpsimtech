/**
 * Cálculo de IVA por línea de venta (Fase 16).
 *
 * Reglas LEGALES GT hardcoded acá:
 *   1. Producto con `isTaxExempt=true` → taxRate=0 SIEMPRE (medicamentos,
 *      canasta básica, servicios médicos exentos), independiente del régimen.
 *   2. Régimen General: 12% IVA, con crédito fiscal.
 *   3. Régimen Pequeño Contribuyente: 5% IVA, sin crédito fiscal.
 *
 * Lo que el cliente configura por empresa:
 *   - Company.taxRegime
 *   - Product.isTaxExempt
 *
 * IMPORTANTE: este helper NO decide el monto del descuento — recibe `discount`
 * como input. El POST /api/sales debe aplicar el descuento ANTES de llamarlo
 * (acá solo se calcula IVA sobre el subtotal post-descuento). Es la convención
 * SAT estándar: descuentos reducen la base gravable.
 */

import type { TaxRegimeCode } from './types';

export interface CalculateLineTaxInput {
  unitPrice: number;
  quantity: number;
  /** Descuento en GTQ de la línea (NO porcentaje). */
  discount: number;
  isTaxExempt: boolean;
  companyTaxRegime: TaxRegimeCode;
}

export interface TaxLineCalc {
  /** Tasa aplicada (0 si exento, 0.12 General, 0.05 Pequeño Contribuyente). */
  taxRate: number;
  /** Monto de IVA de la línea (GTQ). */
  tax: number;
  /** Subtotal antes de IVA y después de descuento. */
  subtotal: number;
  /** Total de la línea: subtotal + tax. */
  total: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Devuelve el desglose tributario de una línea.
 *
 * Errores:
 *   - quantity <= 0 → throw
 *   - unitPrice < 0 → throw
 *   - discount > unitPrice * quantity → throw (subtotal negativo prohibido)
 */
export function calculateLineTax(input: CalculateLineTaxInput): TaxLineCalc {
  const { unitPrice, quantity, discount, isTaxExempt, companyTaxRegime } = input;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Cantidad debe ser un número positivo');
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error('Precio unitario debe ser un número no negativo');
  }
  if (!Number.isFinite(discount) || discount < 0) {
    throw new Error('Descuento debe ser un número no negativo');
  }

  const grossSubtotal = unitPrice * quantity;
  const subtotal = grossSubtotal - discount;
  if (subtotal < 0) {
    throw new Error('Subtotal después de descuento no puede ser negativo');
  }

  let taxRate = 0;
  if (!isTaxExempt) {
    taxRate = companyTaxRegime === 'GENERAL' ? 0.12 : 0.05;
  }

  const tax = round2(subtotal * taxRate);
  const total = round2(subtotal + tax);

  return {
    taxRate,
    tax,
    subtotal: round2(subtotal),
    total,
  };
}

/**
 * Suma totales tributarios de una lista de líneas. Útil para el header de
 * Sale/CreditNote/DebitNote sin pasar por la DB.
 */
export function sumTaxLines(lines: TaxLineCalc[]): {
  subtotal: number;
  tax: number;
  total: number;
} {
  const subtotal = round2(lines.reduce((s, l) => s + l.subtotal, 0));
  const tax = round2(lines.reduce((s, l) => s + l.tax, 0));
  const total = round2(subtotal + tax);
  return { subtotal, tax, total };
}
