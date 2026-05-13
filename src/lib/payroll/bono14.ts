/**
 * Bono 14 — LEY GT (Decreto 42-92).
 *
 * Es un sueldo extra ("catorceavo mes"), exento de ISR y de IGSS, que se
 * paga en la primera quincena de julio.
 *
 * Período legal: del 1 de julio del año anterior al 30 de junio del año
 * en curso (12 meses). El cálculo:
 *
 *   Bono14 = (Σ salarios ordinarios del período) / 12
 *
 * Si el empleado tiene < 12 meses al 30 de junio, se calcula proporcional:
 *
 *   Bono14 = salario_mensual * meses_trabajados / 12
 *
 * Bonificación Incentivo Q250 NO se incluye en la base del Bono14 (SAT y
 * MINTRAB consistentes). Sí se incluyen comisiones promedio si las hay.
 *
 * Provisión mensual contable (para la empresa):
 *
 *   provision_mensual_b14 = salario_mensual / 12
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Meses completos entre dos fechas, considerando día del mes para
 * proporcional. Si hireDate es después de periodStart, cuenta desde
 * hireDate. Retorna decimal con fracción de mes (días/30).
 */
export function monthsBetween(start: Date, end: Date): number {
  if (end.getTime() <= start.getTime()) return 0;
  const ms = end.getTime() - start.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  return days / 30;
}

export interface Bono14Input {
  /** Salario base mensual del empleado. */
  baseSalary: number;
  /** Bonificación incentivo mensual (NO entra al cálculo en GT). */
  bonusIncentive?: number;
  /** Fecha de contratación. */
  hireDate: Date;
  /** Fecha de pago del Bono14 (usualmente quincena 1 de julio del año fiscal). */
  payrollDate: Date;
  /**
   * Modo proporcional al cierre anticipado (uso liquidación al despido).
   * Si está presente, el período termina en `terminationDate` en lugar del
   * 30 de junio fijo del año de `payrollDate`. Sin esto, terminationDate
   * que cae antes del 30 de junio igual computa Bono14 hasta junio
   * (inflado). Bug detectado en verificación Fase 18 (B-1).
   */
  terminationDate?: Date;
}

/**
 * Devuelve el Bono14 a pagar al empleado en la fecha indicada.
 * Si el empleado lleva 12+ meses al cierre del período (30 jun previo a
 * payrollDate), el bono = salario_mensual completo. Si menos, proporcional.
 *
 * Cuando `terminationDate` está presente (liquidación), el período termina
 * en esa fecha. Esto evita el bug donde una terminación a mitad del período
 * legal devuelve un Bono14 inflado (caso B-1 de verificación Fase 18).
 */
export function calculateBono14(input: Bono14Input): number {
  const { baseSalary, hireDate, payrollDate, terminationDate } = input;
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) return 0;

  // Determinar período: por defecto 1-jul(year-1) a 30-jun(year). Si hay
  // terminationDate, el período termina ahí (cierre anticipado por liquidación).
  let periodStart: Date;
  let periodEnd: Date;
  if (terminationDate) {
    // Liquidación: el último período legal terminó en jun del año <= termDate.
    // Si termDate > 30-jun-Y, el último cierre completo fue 30-jun-Y y el
    // proporcional corre desde 1-jul-Y hasta termDate.
    // Si termDate <= 30-jun-Y, el último cierre completo fue 30-jun-(Y-1) y
    // el proporcional corre desde 1-jul-(Y-1) hasta termDate.
    const termYear = terminationDate.getUTCFullYear();
    const juneEndOfTermYear = new Date(Date.UTC(termYear, 5, 30));
    if (terminationDate.getTime() > juneEndOfTermYear.getTime()) {
      periodStart = new Date(Date.UTC(termYear, 6, 1));
    } else {
      periodStart = new Date(Date.UTC(termYear - 1, 6, 1));
    }
    periodEnd = terminationDate;
  } else {
    // Período legal completo: 1 julio (año-1) → 30 junio (año en curso del pago).
    const payYear = payrollDate.getUTCFullYear();
    periodEnd = new Date(Date.UTC(payYear, 5, 30)); // jun=5 (0-idx)
    periodStart = new Date(Date.UTC(payYear - 1, 6, 1)); // jul=6
  }

  const effectiveStart =
    hireDate.getTime() > periodStart.getTime() ? hireDate : periodStart;
  if (effectiveStart.getTime() >= periodEnd.getTime()) return 0;

  const months = Math.min(12, monthsBetween(effectiveStart, periodEnd));
  return round2((baseSalary * months) / 12);
}

/**
 * Provisión mensual del Bono14 = salario_mensual / 12.
 * Se acumula como pasivo (cuenta 2.1.06) durante 12 meses, y al pagar
 * el Bono14 se debita el pasivo.
 */
export function bono14MonthlyProvision(baseSalary: number): number {
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) return 0;
  return round2(baseSalary / 12);
}
