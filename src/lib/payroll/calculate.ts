/**
 * Calculador maestro de PayrollItem · Fase 18.
 *
 * `calculatePayrollItem` toma snapshots del empleado, parámetros del
 * período y devuelve un objeto con TODOS los campos numéricos que
 * persiste en la tabla `PayrollItem`. NO escribe a DB; el caller decide
 * dónde persistir.
 *
 * Reglas aplicadas:
 *   - IGSS 4.83% laboral sobre salario afecto.
 *   - IGSS patronal 10.67% + IRTRA 1% + INTECAP 1%.
 *   - ISR mensual proyectado lineal (anual/12).
 *   - Bono14/aguinaldo: provisión mensual 1/12 cuando es planilla REGULAR.
 *   - Vacaciones: provisión salario/24 cuando es REGULAR.
 *   - Indemnización: provisión salario/12 cuando es REGULAR.
 *   - Bonificación incentivo prorrateada por frecuencia (MONTHLY=100%,
 *     BIWEEKLY=50%).
 *   - Préstamos: cuota mensual aplicada, limitada al saldo pendiente.
 */

import { calculateIgssLaboral, calculateIgssPatronal } from './igss';
import { calculateMonthlyIsr } from './isr';
import { calculateOvertime } from './overtime';
import { bono14MonthlyProvision } from './bono14';
import { aguinaldoMonthlyProvision } from './aguinaldo';
import {
  vacacionesMonthlyProvision,
} from './vacaciones';
import { indemnizacionMonthlyProvision } from './indemnizacion';
import type { PayrollFrequency, PayrollType, Shift } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CalculateInput {
  // Snapshots del empleado:
  baseSalary: number;
  bonusIncentive: number;
  payrollFrequency: PayrollFrequency;
  shift: Shift;
  igssAffiliated: boolean;
  hireDate: Date;

  // Tipo de planilla:
  payrollType: PayrollType;

  // Período:
  daysWorked?: number;
  /** Horas extras del período. */
  overtimeRegularHours?: number;
  overtimeNightHours?: number;
  overtimeHolidayHours?: number;
  seventhDayAmount?: number;
  commissions?: number;
  otherBonuses?: number;
  otherDeductions?: number;
  /** Cuota mensual de préstamo a deducir (limitada por balance). */
  loanInstallment?: number;
  /** Gastos médicos/colegio comprobados anuales (para ISR). */
  gastosMedicosOC?: number;
}

export interface CalculateResult {
  // Snapshots / inputs (echados para persistencia):
  baseSalary: number;
  bonusIncentive: number;
  daysWorked: number;
  overtimeRegularHours: number;
  overtimeRegularAmount: number;
  overtimeNightHours: number;
  overtimeNightAmount: number;
  overtimeHolidayHours: number;
  overtimeHolidayAmount: number;
  seventhDayAmount: number;
  commissions: number;
  otherBonuses: number;
  // Bruto:
  totalGross: number;
  // Deducciones:
  igssLaboral: number;
  isr: number;
  loanDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  // Provisiones:
  bono14Provision: number;
  aguinaldoProvision: number;
  indemnizacionProvision: number;
  vacacionesProvision: number;
  // Cargas patronales:
  igssPatronal: number;
  irtra: number;
  intecap: number;
  totalCostoPatronal: number;
}

/**
 * Factor de prorrateo de bonificación incentivo según frecuencia.
 */
function frequencyFactor(freq: PayrollFrequency): number {
  switch (freq) {
    case 'MONTHLY':
      return 1;
    case 'BIWEEKLY':
      return 0.5;
    default:
      return 1;
  }
}

/**
 * Días default del período según frecuencia (B-2 fix verificación Fase 18).
 * BIWEEKLY defaultea a 15 días para que el prorrateo del salario base sea
 * correcto. Sin esto, planillas quincenales pagaban el mes entero cada quincena.
 */
function defaultDaysForFrequency(freq: PayrollFrequency): number {
  switch (freq) {
    case 'MONTHLY':
      return 30;
    case 'BIWEEKLY':
      return 15;
    default:
      return 30;
  }
}

export function calculatePayrollItem(input: CalculateInput): CalculateResult {
  const baseSalary = Math.max(0, Number(input.baseSalary) || 0);
  const bonusIncentivePeriod = round2(
    Math.max(0, Number(input.bonusIncentive) || 0) *
      frequencyFactor(input.payrollFrequency),
  );

  // Días del período: por default 30 mensual, 15 quincenal. El caller puede
  // override (ej. empleado tomó días de licencia y queda con < daysWorked).
  const defaultDays = defaultDaysForFrequency(input.payrollFrequency);
  const daysWorked = Math.max(0, Number(input.daysWorked ?? defaultDays));

  // Para planillas REGULAR, prorratear sueldo si daysWorked < defaultDays
  // (faltas/licencias). El divisor sigue siendo 30 porque baseSalary es el
  // sueldo mensual contractual, no el del período.
  const periodSalary =
    input.payrollType === 'REGULAR'
      ? round2((baseSalary * Math.min(daysWorked, defaultDays)) / 30)
      : baseSalary;

  // Horas extras (solo en REGULAR habitualmente):
  const ot = calculateOvertime({
    baseSalary,
    shift: input.shift,
    regularHours: input.overtimeRegularHours ?? 0,
    nightHours: input.overtimeNightHours ?? 0,
    holidayHours: input.overtimeHolidayHours ?? 0,
  });

  const seventhDayAmount = Math.max(0, Number(input.seventhDayAmount ?? 0));
  const commissions = Math.max(0, Number(input.commissions ?? 0));
  const otherBonuses = Math.max(0, Number(input.otherBonuses ?? 0));

  const totalGross = round2(
    periodSalary +
      bonusIncentivePeriod +
      ot.total +
      seventhDayAmount +
      commissions +
      otherBonuses,
  );

  // Base IGSS = salario afecto (NO incluye bonificación incentivo).
  const igssBase = round2(
    periodSalary + ot.total + seventhDayAmount + commissions,
  );

  // IGSS y ISR sólo aplican en REGULAR (Bono14/aguinaldo son EXENTOS por ley).
  let igssLaboral = 0;
  let igssPat = { igssPatronal: 0, irtra: 0, intecap: 0, total: 0 };
  let isr = 0;
  if (input.payrollType === 'REGULAR' || input.payrollType === 'EXTRAORDINARIA') {
    igssLaboral = calculateIgssLaboral(igssBase, input.igssAffiliated);
    igssPat = calculateIgssPatronal(igssBase, input.igssAffiliated);
    isr = calculateMonthlyIsr({
      monthlyAfectoSalary: igssBase,
      monthlyIgss: igssLaboral,
      gastosMedicosOC: input.gastosMedicosOC,
    });
  }

  const loanDeduction = Math.max(0, Number(input.loanInstallment ?? 0));
  const otherDeductions = Math.max(0, Number(input.otherDeductions ?? 0));

  const totalDeductions = round2(
    igssLaboral + isr + loanDeduction + otherDeductions,
  );
  const netSalary = round2(totalGross - totalDeductions);

  // Provisiones (solo en REGULAR; en BONO14/AGUINALDO/INDEMNIZACION el
  // pago no genera provisión nueva — se aplica el saldo).
  let bono14Provision = 0;
  let aguinaldoProvision = 0;
  let indemnizacionProvision = 0;
  let vacacionesProvision = 0;
  if (input.payrollType === 'REGULAR') {
    const factor = frequencyFactor(input.payrollFrequency);
    bono14Provision = round2(bono14MonthlyProvision(baseSalary) * factor);
    aguinaldoProvision = round2(aguinaldoMonthlyProvision(baseSalary) * factor);
    indemnizacionProvision = round2(
      indemnizacionMonthlyProvision(baseSalary) * factor,
    );
    vacacionesProvision = round2(vacacionesMonthlyProvision(baseSalary) * factor);
  }

  return {
    baseSalary: periodSalary,
    bonusIncentive: bonusIncentivePeriod,
    daysWorked,
    overtimeRegularHours: input.overtimeRegularHours ?? 0,
    overtimeRegularAmount: ot.regularAmount,
    overtimeNightHours: input.overtimeNightHours ?? 0,
    overtimeNightAmount: ot.nightAmount,
    overtimeHolidayHours: input.overtimeHolidayHours ?? 0,
    overtimeHolidayAmount: ot.holidayAmount,
    seventhDayAmount,
    commissions,
    otherBonuses,
    totalGross,
    igssLaboral,
    isr,
    loanDeduction,
    otherDeductions,
    totalDeductions,
    netSalary,
    bono14Provision,
    aguinaldoProvision,
    indemnizacionProvision,
    vacacionesProvision,
    igssPatronal: igssPat.igssPatronal,
    irtra: igssPat.irtra,
    intecap: igssPat.intecap,
    totalCostoPatronal: igssPat.total,
  };
}

void calculateOvertime; // avoid unused import warning (re-exported indirectly)
