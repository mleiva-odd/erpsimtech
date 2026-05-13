/**
 * ISR (Impuesto Sobre la Renta) en relación de dependencia — LEY GT.
 *
 * Base legal: Decreto 10-2012 (Ley de Actualización Tributaria), artículos
 * 72 al 81, vigente actualmente. La tabla progresiva sobre renta neta
 * imponible anual es:
 *
 *   Tramo 1: Q0      – Q300,000   → 5%
 *   Tramo 2: > Q300,000          → Q15,000 + 7% sobre el excedente
 *
 * NOTA: Esta es la tabla real GT. El brief original menciona "Q48,000 →
 * 5%, escalón 7%" — esa cifra es la DEDUCCIÓN PERSONAL anual (Q48k), no
 * el techo del tramo 1. La tabla SAT progresiva opera sobre Q300k.
 * Mantenemos los nombres del brief pero ajustamos los valores.
 *
 * Renta neta = ingresos brutos anuales (salario afecto + horas extras +
 *   comisiones + Bono14 NO está afecto, aguinaldo NO está afecto) MENOS
 *   deducción personal Q48,000 MENOS cuota IGSS retenida anual MENOS
 *   gastos médicos/colegio comprobados (máx Q12,000) MENOS donaciones
 *   acreditadas. Para este motor consideramos los 4 primeros.
 *
 * Retención mensual = ISR anual / 12 (proyección lineal). Diciembre puede
 * traer un ajuste si en la planilla anual hubo desvíos — no se modela en
 * esta fase (Fase 22+).
 */

export const ISR_TRAMO1_LIMIT = 300000; // Q anual (renta neta imponible)
export const ISR_TRAMO1_RATE = 0.05; // 5%
export const ISR_TRAMO1_MAX_TAX = 15000; // Q15,000 = 300k * 5%
export const ISR_TRAMO2_RATE = 0.07; // 7%

export const DEDUCCION_PERSONAL = 48000; // Q anual
export const GASTOS_MEDICOS_MAX = 12000; // Q anual (gastos médicos/colegio)

export interface IsrAnnualInput {
  /** Salario afecto anual (sueldo + horas extras + comisiones, NO incluye Bono14/aguinaldo). */
  annualSalary: number;
  /** Suma anual de cuotas IGSS laboral retenidas (4.83% * salario afecto * 12). */
  annualIgss: number;
  /** Gastos médicos/colegio comprobados del año (máx Q12,000). Opcional. */
  gastosMedicosOC?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcula el ISR anual a retener en relación de dependencia.
 * Aplica la tabla progresiva sobre renta neta imponible.
 * Retorna 0 si la renta neta ≤ 0.
 */
export function calculateAnnualIsr(input: IsrAnnualInput): number {
  const annualSalary = Math.max(0, Number(input.annualSalary) || 0);
  const annualIgss = Math.max(0, Number(input.annualIgss) || 0);
  const gastos = Math.max(
    0,
    Math.min(Number(input.gastosMedicosOC) || 0, GASTOS_MEDICOS_MAX),
  );

  const rentaNeta = annualSalary - DEDUCCION_PERSONAL - annualIgss - gastos;
  if (rentaNeta <= 0) return 0;

  if (rentaNeta <= ISR_TRAMO1_LIMIT) {
    return round2(rentaNeta * ISR_TRAMO1_RATE);
  }
  const excedente = rentaNeta - ISR_TRAMO1_LIMIT;
  return round2(ISR_TRAMO1_MAX_TAX + excedente * ISR_TRAMO2_RATE);
}

/**
 * Calcula la retención ISR mensual proyectada (= ISR anual / 12).
 * Redondeo a 2 decimales.
 */
export function monthlyIsrWithholding(annualIsr: number): number {
  if (!Number.isFinite(annualIsr) || annualIsr <= 0) return 0;
  return round2(annualIsr / 12);
}

/**
 * Atajo: dado el sueldo afecto MENSUAL y la cuota IGSS MENSUAL, devuelve
 * el ISR a retener este mes (proyectando los 12 meses iguales).
 */
export function calculateMonthlyIsr(input: {
  monthlyAfectoSalary: number;
  monthlyIgss: number;
  gastosMedicosOC?: number;
}): number {
  const annual = calculateAnnualIsr({
    annualSalary: input.monthlyAfectoSalary * 12,
    annualIgss: input.monthlyIgss * 12,
    gastosMedicosOC: input.gastosMedicosOC,
  });
  return monthlyIsrWithholding(annual);
}
