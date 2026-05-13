/**
 * Indemnización — LEY GT (Código de Trabajo art. 82).
 *
 * Al despido injustificado o terminación de contrato sin causa imputable
 * al trabajador, la empresa debe pagar:
 *
 *   1. INDEMNIZACIÓN: 1 mes de sueldo por cada año de servicio
 *      (o proporcional fraccionario).
 *   2. AGUINALDO PROPORCIONAL del período en curso.
 *   3. BONO 14 PROPORCIONAL del período en curso.
 *   4. VACACIONES NO GOZADAS (días devengados − tomados) × valor diario.
 *
 * Base de cálculo de indemnización: el "salario promedio" de los últimos
 * 6 meses, incluyendo bonificaciones habituales (sí incluye bonificación
 * incentivo aquí, art. 89 CT). Para este motor, recibimos `averageSalary`
 * como parámetro — el caller lo computa.
 *
 * Provisión mensual: salario / 12 (acumulación contable mensual del
 * pasivo indemnización).
 */

import { calculateBono14 } from './bono14';
import { calculateAguinaldo } from './aguinaldo';
import { unpaidVacationCompensation } from './vacaciones';
import { monthsBetween } from './bono14';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface IndemnizacionInput {
  /** Salario promedio últimos 6 meses (incluye bonificación incentivo). */
  averageSalary: number;
  /** Salario base mensual actual (para Bono14/aguinaldo prop.). */
  baseSalary: number;
  /** Bonificación incentivo (informativa). */
  bonusIncentive?: number;
  hireDate: Date;
  /** Fecha de terminación de la relación laboral. */
  terminationDate: Date;
  /** Días de vacaciones ya tomados desde hireDate. */
  vacationDaysTaken?: number;
}

export interface IndemnizacionResult {
  indemnizacion: number;
  bono14Proporcional: number;
  aguinaldoProporcional: number;
  vacacionesNoGozadas: number;
  total: number;
  yearsOfService: number;
}

/**
 * Calcula la liquidación completa al despido.
 */
export function calculateIndemnizacion(
  input: IndemnizacionInput,
): IndemnizacionResult {
  const months = monthsBetween(input.hireDate, input.terminationDate);
  const years = months / 12;

  const avg = Math.max(0, Number(input.averageSalary) || 0);

  const indemnizacion = round2(avg * years);

  // B-1 fix (verificación Fase 18): pasar `terminationDate` para que el
  // período del Bono14/Aguinaldo termine ahí en lugar del 30-jun/30-nov
  // legal estándar. Sin esto, un empleado terminado el 1-ene-2026 recibía
  // Bono14 calculado contra el cierre 30-jun-2026 → inflado ~Q5k vs ~Q2.9k.
  const bono14Proporcional = calculateBono14({
    baseSalary: input.baseSalary,
    hireDate: input.hireDate,
    payrollDate: input.terminationDate,
    terminationDate: input.terminationDate,
  });

  const aguinaldoProporcional = calculateAguinaldo({
    baseSalary: input.baseSalary,
    hireDate: input.hireDate,
    payrollDate: input.terminationDate,
    terminationDate: input.terminationDate,
  });

  const vacacionesNoGozadas = unpaidVacationCompensation({
    baseSalary: input.baseSalary,
    hireDate: input.hireDate,
    endDate: input.terminationDate,
    vacationDaysTaken: input.vacationDaysTaken ?? 0,
  });

  const total = round2(
    indemnizacion +
      bono14Proporcional +
      aguinaldoProporcional +
      vacacionesNoGozadas,
  );

  return {
    indemnizacion,
    bono14Proporcional,
    aguinaldoProporcional,
    vacacionesNoGozadas,
    total,
    yearsOfService: round2(years),
  };
}

/**
 * Provisión mensual = salario / 12.
 */
export function indemnizacionMonthlyProvision(baseSalary: number): number {
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) return 0;
  return round2(baseSalary / 12);
}
