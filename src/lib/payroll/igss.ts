/**
 * IGSS (Instituto Guatemalteco de Seguridad Social) — LEY GT (hardcoded).
 *
 * No es configurable por empresa: las tasas las fija el IGSS.
 *
 * Cuotas:
 *   - Laboral (cargo del empleado, descontado del salario): 4.83%.
 *   - Patronal (cargo del empleador, NO descontado al empleado):
 *       IGSS Patronal          10.67%
 *       IRTRA (turismo)         1.00%
 *       INTECAP (capacitación)  1.00%
 *       ───────────────────────────
 *       Total cargas patronales 12.67%
 *
 * Base de cálculo: salario ordinario + comisiones + horas extras + séptimo
 * día. NO incluye Bonificación Incentivo Ley 78-89 (es bonificación, no
 * sueldo afecto a IGSS) ni provisiones de Bono14/Aguinaldo (esas son
 * obligaciones del empleador, no salario corriente).
 *
 * Empleados no afiliados (`igssAffiliated=false`): cuotas = 0 (ej. plazos
 * fijos temporales no inscritos).
 */

export const IGSS_LABORAL_RATE = 0.0483; // 4.83%
export const IGSS_PATRONAL_RATE = 0.1067; // 10.67%
export const IRTRA_RATE = 0.01; // 1.00%
export const INTECAP_RATE = 0.01; // 1.00%
export const IGSS_TOTAL_PATRONAL_RATE =
  IGSS_PATRONAL_RATE + IRTRA_RATE + INTECAP_RATE; // 12.67%

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcula la cuota laboral IGSS (4.83%) sobre la base IGSS-afecta.
 * `igssAffiliated=false` → retorna 0.
 */
export function calculateIgssLaboral(
  igssBase: number,
  igssAffiliated: boolean,
): number {
  if (!igssAffiliated) return 0;
  if (!Number.isFinite(igssBase) || igssBase <= 0) return 0;
  return round2(igssBase * IGSS_LABORAL_RATE);
}

export interface IgssPatronalResult {
  igssPatronal: number;
  irtra: number;
  intecap: number;
  total: number;
}

/**
 * Calcula las cargas patronales (IGSS 10.67% + IRTRA 1% + INTECAP 1%).
 * Solo se aplican a empleados afiliados.
 */
export function calculateIgssPatronal(
  igssBase: number,
  igssAffiliated: boolean,
): IgssPatronalResult {
  if (!igssAffiliated || !Number.isFinite(igssBase) || igssBase <= 0) {
    return { igssPatronal: 0, irtra: 0, intecap: 0, total: 0 };
  }
  const igssPatronal = round2(igssBase * IGSS_PATRONAL_RATE);
  const irtra = round2(igssBase * IRTRA_RATE);
  const intecap = round2(igssBase * INTECAP_RATE);
  return {
    igssPatronal,
    irtra,
    intecap,
    total: round2(igssPatronal + irtra + intecap),
  };
}
