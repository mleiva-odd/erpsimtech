/**
 * Séptimo día — LEY GT (Código de Trabajo art. 126).
 *
 * Todo trabajador que trabaja 6 días a la semana tiene derecho a UN día
 * de descanso semanal PAGADO ("séptimo día"). Para empleados mensuales
 * con sueldo fijo, ya está incluido en el sueldo mensual (cuenta como
 * 30 días). Para JORNALEROS (cobran por día efectivamente trabajado),
 * el séptimo día debe pagarse aparte.
 *
 * Cálculo para jornaleros:
 *
 *   séptimo_día = (Σ salarios + horas extras de los 6 días) / 6
 *
 * Esto equivale al promedio diario incluyendo overtime.
 *
 * Para empleados mensuales en planilla regular, este helper retorna 0 —
 * ya está prorrateado en el sueldo.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface SeventhDayInput {
  /**
   * Si el empleado cobra por día (jornalero) requiere séptimo día explícito.
   * Si es asalariado mensual fijo, retorna 0.
   */
  isJornalero: boolean;
  /** Suma de pagos por días trabajados en la semana (los 6 días). */
  weeklyEarnings: number;
  /** Cantidad de semanas que aplican en el período de planilla. */
  weeksInPeriod: number;
}

/**
 * Calcula el pago de séptimo día acumulado en el período.
 * Para asalariados mensuales = 0 (ya incluido).
 */
export function calculateSeventhDayPay(input: SeventhDayInput): number {
  if (!input.isJornalero) return 0;
  const earnings = Math.max(0, Number(input.weeklyEarnings) || 0);
  const weeks = Math.max(0, Number(input.weeksInPeriod) || 0);
  if (earnings <= 0 || weeks <= 0) return 0;
  const perWeek = earnings / 6;
  return round2(perWeek * weeks);
}
