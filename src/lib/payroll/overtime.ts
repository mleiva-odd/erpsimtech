/**
 * Horas extras — LEY GT (Código de Trabajo art. 121 y siguientes).
 *
 * Jornada ordinaria (art. 116):
 *   - DIURNA   : 8 hrs/día (6:00 a 18:00).
 *   - NOCTURNA : 6 hrs/día (18:00 a 6:00).
 *   - MIXTA    : 7 hrs/día (cruzando ambos rangos, máx 4h nocturnas).
 *
 * Premium sobre el valor de la hora ordinaria:
 *   - Horas extras diurnas       → +50%  (1.50× la hora normal).
 *   - Horas extras nocturnas/mixtas y feriados → +100% (2.00× la normal).
 *
 * Valor hora ordinaria = (sueldo_mensual / 30 días) / horas_jornada_día.
 * Convención GT: usar 30 días al mes y la jornada base correspondiente.
 *
 * Implementación: dados las horas extras del período por tipo (regulares/
 * nocturnas/feriados), calcula los pagos.
 */

import type { Shift } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const OVERTIME_REGULAR_MULTIPLIER = 1.5;
export const OVERTIME_NIGHT_MULTIPLIER = 2.0;
export const OVERTIME_HOLIDAY_MULTIPLIER = 2.0;

/**
 * Horas de jornada ordinaria por día según turno.
 */
export function jornadaHoursPerDay(shift: Shift): number {
  switch (shift) {
    case 'DIURNA':
      return 8;
    case 'NOCTURNA':
      return 6;
    case 'MIXTA':
      return 7;
    default:
      return 8;
  }
}

/**
 * Valor de la hora ordinaria.
 *   = (sueldo / 30) / horas_jornada_día
 */
export function hourlyRate(baseSalary: number, shift: Shift): number {
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) return 0;
  const hpd = jornadaHoursPerDay(shift);
  return round2(baseSalary / 30 / hpd);
}

export interface OvertimeInput {
  baseSalary: number;
  shift: Shift;
  /** Horas extras diurnas (1.5×). */
  regularHours: number;
  /** Horas extras nocturnas o jornada mixta nocturna (2.0×). */
  nightHours: number;
  /** Horas trabajadas en día feriado/séptimo día/asueto (2.0×). */
  holidayHours: number;
}

export interface OvertimeResult {
  hourlyRate: number;
  regularAmount: number;
  nightAmount: number;
  holidayAmount: number;
  total: number;
}

/**
 * Calcula los montos de horas extras según tipo.
 */
export function calculateOvertime(input: OvertimeInput): OvertimeResult {
  const rate = hourlyRate(input.baseSalary, input.shift);
  const reg = Math.max(0, Number(input.regularHours) || 0);
  const ngt = Math.max(0, Number(input.nightHours) || 0);
  const hol = Math.max(0, Number(input.holidayHours) || 0);

  const regularAmount = round2(reg * rate * OVERTIME_REGULAR_MULTIPLIER);
  const nightAmount = round2(ngt * rate * OVERTIME_NIGHT_MULTIPLIER);
  const holidayAmount = round2(hol * rate * OVERTIME_HOLIDAY_MULTIPLIER);

  return {
    hourlyRate: rate,
    regularAmount,
    nightAmount,
    holidayAmount,
    total: round2(regularAmount + nightAmount + holidayAmount),
  };
}
