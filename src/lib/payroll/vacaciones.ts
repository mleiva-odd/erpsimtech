/**
 * Vacaciones — LEY GT (Código de Trabajo art. 130).
 *
 * Todo trabajador con un año de servicio continuo tiene derecho a 15 días
 * hábiles de vacaciones pagadas. Si la relación termina antes de cumplir
 * el año, paga proporcional sobre días devengados.
 *
 *   provisión_mensual = (salario_mensual / 12) × (15/30) = salario / 24
 *
 * Esto representa la "cuota de vacaciones" que la empresa debe reservar
 * cada mes — equivalente a pagar 15 días al cabo de un año.
 *
 * Días devengados = (mesesTrabajados / 12) × 15.
 *
 * Para liquidar vacaciones no gozadas al despido, multiplicar
 * (díasDevengados − díasTomados) × valorDiario.
 */

import { monthsBetween } from './bono14';

export const VACATION_DAYS_PER_YEAR = 15;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Provisión mensual = sueldo / 24 (equivale a 15 días al año / 12 meses /
 * 30 días * sueldo). Sale en cuenta `2.1.08` (Provisión Indemnización
 * lato sensu) o cuenta dedicada si la empresa la abrió.
 */
export function vacacionesMonthlyProvision(baseSalary: number): number {
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) return 0;
  return round2(baseSalary / 24);
}

/**
 * Días de vacaciones devengados al período. Si hireDate >= asOf, 0.
 */
export function vacationDaysAccrued(hireDate: Date, asOf: Date): number {
  const months = monthsBetween(hireDate, asOf);
  if (months <= 0) return 0;
  return round2((months / 12) * VACATION_DAYS_PER_YEAR);
}

/**
 * Valor diario para liquidar vacaciones. Convención GT: salario_mensual / 30.
 * (Para jornaleros se usa el salario diario directo.)
 */
export function dailyVacationValue(baseSalary: number): number {
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) return 0;
  return round2(baseSalary / 30);
}

/**
 * Vacaciones no gozadas al despido: (devengados − tomados) × valor diario.
 * Devuelve 0 si tomó más de los que devengó (caso anómalo).
 */
export function unpaidVacationCompensation(input: {
  baseSalary: number;
  hireDate: Date;
  endDate: Date;
  vacationDaysTaken: number;
}): number {
  const accrued = vacationDaysAccrued(input.hireDate, input.endDate);
  const unpaid = Math.max(0, accrued - input.vacationDaysTaken);
  return round2(unpaid * dailyVacationValue(input.baseSalary));
}
