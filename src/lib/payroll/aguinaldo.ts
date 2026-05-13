/**
 * Aguinaldo — LEY GT (Decreto 76-78).
 *
 * Es el "decimotercer sueldo", exento de ISR y de IGSS, que se paga:
 *   - 50% en la primera quincena de diciembre (antes del 20).
 *   - 50% en la segunda quincena de enero (antes del 15).
 *
 * Período legal: del 1 de diciembre del año anterior al 30 de noviembre
 * del año en curso. Cálculo idéntico al Bono14:
 *
 *   Aguinaldo = (Σ salarios ordinarios del período) / 12
 *
 * Bonificación incentivo NO entra. Comisiones promedio sí.
 *
 * Provisión mensual: salario_mensual / 12 (igual que Bono14).
 *
 * En la práctica, muchas empresas pagan los 100% en diciembre — este
 * helper retorna el monto total. El split 50/50 lo hace el endpoint
 * /pay si se requiere.
 */

import { monthsBetween } from './bono14';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface AguinaldoInput {
  baseSalary: number;
  bonusIncentive?: number;
  hireDate: Date;
  payrollDate: Date; // fecha de pago del aguinaldo (típicamente diciembre)
  /**
   * Modo proporcional al cierre anticipado (liquidación al despido).
   * Si está presente, el período termina en `terminationDate`. Sin esto,
   * una terminación a mitad del período legal devuelve aguinaldo inflado
   * (bug B-1 de verificación Fase 18).
   */
  terminationDate?: Date;
}

export function calculateAguinaldo(input: AguinaldoInput): number {
  const { baseSalary, hireDate, payrollDate, terminationDate } = input;
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) return 0;

  let periodStart: Date;
  let periodEnd: Date;
  if (terminationDate) {
    // Liquidación: período proporcional desde el último 1-dic anterior a termDate.
    const termYear = terminationDate.getUTCFullYear();
    const novEndOfTermYear = new Date(Date.UTC(termYear, 10, 30));
    if (terminationDate.getTime() > novEndOfTermYear.getTime()) {
      // termDate cae en diciembre del año termYear → período actual empezó 1-dic-termYear.
      periodStart = new Date(Date.UTC(termYear, 11, 1));
    } else {
      // termDate cae entre enero y noviembre → período actual empezó 1-dic-(termYear-1).
      periodStart = new Date(Date.UTC(termYear - 1, 11, 1));
    }
    periodEnd = terminationDate;
  } else {
    // Período legal completo: 1 dic (año-1) → 30 nov (año en curso del pago).
    const payYear = payrollDate.getUTCFullYear();
    periodEnd = new Date(Date.UTC(payYear, 10, 30)); // nov=10
    periodStart = new Date(Date.UTC(payYear - 1, 11, 1)); // dic=11
  }

  const effectiveStart =
    hireDate.getTime() > periodStart.getTime() ? hireDate : periodStart;
  if (effectiveStart.getTime() >= periodEnd.getTime()) return 0;

  const months = Math.min(12, monthsBetween(effectiveStart, periodEnd));
  return round2((baseSalary * months) / 12);
}

export function aguinaldoMonthlyProvision(baseSalary: number): number {
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) return 0;
  return round2(baseSalary / 12);
}
