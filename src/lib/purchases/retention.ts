/**
 * Fase 19 · Cálculo de retenciones GT en compras a proveedores.
 *
 * Cubre tres casos legales:
 *
 *  1. Retención IVA Pequeño Contribuyente (5%):
 *     Aplica cuando el proveedor es PEQUENO_CONTRIBUYENTE y la empresa fue
 *     calificada como Agente de Retención del IVA (PC). La empresa retiene
 *     el 5% del subtotal y lo declara/paga a SAT directamente.
 *
 *  2. Retención IVA general (15%):
 *     Aplica si la empresa fue calificada como Agente de Retención del IVA
 *     (15%) — caso menos común, solo empresas grandes. Se retiene 15% sobre
 *     el IVA debitado en la factura.
 *
 *  3. Retención ISR servicios profesionales (5% o 7%):
 *     Aplica cuando el proveedor presta servicios profesionales y la empresa
 *     debe retener ISR según el régimen del prestador. La tasa default es 5%
 *     (tramo I, hasta Q30,000/mes) y sube a 7% (tramo II) si la facturación
 *     mensual supera el umbral SAT.
 *
 * Estos helpers son puros (no tocan DB). El call site decide:
 *  - si aplica cada flag (Supplier.withholdsIVA, Supplier.withholdsISR),
 *  - el subtotal, IVA y monto del invoice.
 */

// NO importamos TaxRegime de '@prisma/client' porque el cliente del sandbox
// no lo tiene generado (Fase 16 pendiente de prisma generate). Tipo local
// que matchea el enum del schema.
export type TaxRegime = 'GENERAL' | 'PEQUENO_CONTRIBUYENTE';

/** Tasa fija de retención IVA Pequeño Contribuyente (5%). */
export const IVA_RETENTION_PC_RATE = 0.05;

/**
 * Tasa retención IVA general (Agente del 15%). Aplica sobre el monto del IVA
 * débito (no sobre el subtotal). Es decir: si IVA=Q120, retención=Q18.
 */
export const IVA_RETENTION_GENERAL_RATE = 0.15;

/** Tasa ISR tramo I (Q0 - Q30,000 / mes). */
export const ISR_RATE_TRAMO_I = 0.05;

/** Tasa ISR tramo II (> Q30,000 / mes). */
export const ISR_RATE_TRAMO_II = 0.07;

/**
 * Umbral mensual para subir de tramo I (5%) a tramo II (7%) en retención ISR
 * de servicios profesionales. La empresa puede setearlo manualmente por
 * proveedor vía `Supplier.isrRate`; este valor es solo un default informativo
 * para el frontend al alta del proveedor.
 */
export const ISR_TRAMO_THRESHOLD_MONTHLY = 30000;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface RetentionInput {
  /** Subtotal de la factura proveedor (sin IVA). */
  subtotal: number;
  /** IVA débito de la factura (0 si proveedor es PC o exento). */
  tax: number;
  /** Régimen tributario del proveedor (snapshot al momento de la PO). */
  supplierTaxRegime: TaxRegime | null | undefined;
  /** Flag configurable: la empresa retiene IVA a este proveedor. */
  withholdsIVA: boolean;
  /** Flag configurable: la empresa retiene ISR servicios a este proveedor. */
  withholdsISR: boolean;
  /** Tasa ISR aplicable (default 0.05). */
  isrRate?: number;
}

export interface RetentionResult {
  withheldIVA: number;
  withheldISR: number;
  /**
   * Total neto a pagar al proveedor: subtotal + tax - withheldIVA - withheldISR.
   * Es el monto que la empresa transfiere/paga. La diferencia (retenciones)
   * queda como pasivo "ISR Retenido por Pagar" / "IVA Débito Fiscal" hasta
   * que se declare a SAT.
   */
  total: number;
}

/**
 * Calcula retenciones IVA + ISR sobre una factura proveedor.
 *
 * Reglas:
 * - Si subtotal <= 0, retenciones = 0.
 * - Retención IVA PC (5%): subtotal * 5% — solo si supplierTaxRegime =
 *   PEQUENO_CONTRIBUYENTE Y withholdsIVA=true.
 * - Retención IVA general (15%): tax * 15% — solo si supplierTaxRegime =
 *   GENERAL Y withholdsIVA=true. (Configuración por proveedor para Agentes
 *   del 15%.)
 * - Retención ISR: subtotal * isrRate — solo si withholdsISR=true.
 * - Retenciones siempre se redondean a 2 decimales (cents).
 *
 * Si el proveedor es PC y la empresa NO retiene IVA, la factura NO genera
 * IVA crédito fiscal (PC no factura IVA débito). Eso lo maneja el caller
 * pasando `tax=0`.
 */
export function calculateRetention(input: RetentionInput): RetentionResult {
  const subtotal = Number(input.subtotal) || 0;
  const tax = Number(input.tax) || 0;
  const isrRate = Number(input.isrRate ?? ISR_RATE_TRAMO_I) || 0;

  if (subtotal <= 0) {
    return { withheldIVA: 0, withheldISR: 0, total: round2(subtotal + tax) };
  }

  let withheldIVA = 0;
  if (input.withholdsIVA) {
    if (input.supplierTaxRegime === 'PEQUENO_CONTRIBUYENTE') {
      withheldIVA = subtotal * IVA_RETENTION_PC_RATE;
    } else if (input.supplierTaxRegime === 'GENERAL') {
      // Agente del 15%: retiene 15% del IVA débito (no del subtotal).
      withheldIVA = tax * IVA_RETENTION_GENERAL_RATE;
    }
  }

  const withheldISR = input.withholdsISR ? subtotal * isrRate : 0;

  const withheldIVA2 = round2(withheldIVA);
  const withheldISR2 = round2(withheldISR);
  const total = round2(subtotal + tax - withheldIVA2 - withheldISR2);
  return { withheldIVA: withheldIVA2, withheldISR: withheldISR2, total };
}

/**
 * Determina si la tasa ISR sugerida es tramo I (5%) o tramo II (7%) en base
 * al monto facturado mensual del proveedor. Para uso del frontend al subir
 * automáticamente el switch de `Supplier.isrRate`.
 *
 * NO se invoca al calcular retenciones — la tasa se lee siempre de
 * `Supplier.isrRate` (configurable por usuario, default 0.05).
 */
export function suggestedIsrRate(monthlyAccumulated: number): number {
  return monthlyAccumulated > ISR_TRAMO_THRESHOLD_MONTHLY
    ? ISR_RATE_TRAMO_II
    : ISR_RATE_TRAMO_I;
}
