/**
 * Asiento contable de planilla · Fase 18.
 *
 * Patrón "partida doble" usando `createJournalEntry` (Fase 14). Cada
 * `Payroll.payrollType` genera un asiento con un set distinto de líneas.
 *
 * REGULAR (planilla mensual/quincenal):
 *
 *   DR Sueldos y Salarios       (5.2.01) ← Σ totalGross − Σ bonusIncentive
 *   DR Bonificación Incentivo   (5.2.03) ← Σ bonusIncentive
 *   DR IGSS Patronal (Gasto)    (5.2.02) ← Σ totalCostoPatronal
 *   DR Operating Expenses       (5.3.01) ← Σ provisiones (Bono14+Aguinaldo+Indemn+Vacaciones)
 *     CR IGSS por Pagar         (2.1.04) ← Σ igssLaboral + Σ totalCostoPatronal
 *     CR ISR Retenido por Pagar (2.1.03) ← Σ isr
 *     CR Sueldos por Pagar      (2.1.05) ← Σ netSalary + Σ loanDeduction + Σ otherDeductions
 *     CR Provisión Bono 14      (2.1.06) ← Σ bono14Provision
 *     CR Provisión Aguinaldo    (2.1.07) ← Σ aguinaldoProvision
 *     CR Provisión Indemnización(2.1.08) ← Σ indemnizacionProvision + Σ vacacionesProvision
 *
 * BONO14 (pago):
 *
 *   DR Provisión Bono 14        (2.1.06) ← Σ totalGross (cancela pasivo acumulado)
 *     CR Sueldos por Pagar      (2.1.05) ← Σ netSalary
 *
 * AGUINALDO (pago):
 *
 *   DR Provisión Aguinaldo      (2.1.07) ← Σ totalGross
 *     CR Sueldos por Pagar      (2.1.05) ← Σ netSalary
 *
 * INDEMNIZACION (liquidación):
 *
 *   DR Provisión Indemnización  (2.1.08) ← Σ totalGross
 *     CR Sueldos por Pagar      (2.1.05) ← Σ netSalary
 *
 * NOTAS:
 *   - "Operating Expenses" se usa como cuenta de gasto para las
 *     provisiones nuevas que el plan-de-cuentas no diferencia (Fase 22+
 *     puede abrir cuentas dedicadas tipo 5.2.04 Provisión Bono14 Gasto).
 *   - Los préstamos descontados al empleado (`loanDeduction`) se quedan
 *     en Sueldos por Pagar (CR), porque la salida real de caja ocurre en
 *     un asiento separado al desembolsar el pago al banco. El registro
 *     contable de la baja del préstamo se hace al pagar Salaries Payable.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { ACCOUNTS } from '@/lib/accounting/accounts';
import { createJournalEntry, JournalError } from '@/lib/accounting/journal';

type Tx = Prisma.TransactionClient | PrismaClient;

type PayrollItemRow = {
  baseSalary: unknown;
  bonusIncentive: unknown;
  totalGross: unknown;
  igssLaboral: unknown;
  isr: unknown;
  loanDeduction: unknown;
  otherDeductions: unknown;
  totalDeductions: unknown;
  netSalary: unknown;
  bono14Provision: unknown;
  aguinaldoProvision: unknown;
  indemnizacionProvision: unknown;
  vacacionesProvision: unknown;
  igssPatronal: unknown;
  irtra: unknown;
  intecap: unknown;
  totalCostoPatronal: unknown;
};

type PayrollRow = {
  id: string;
  companyId: string;
  payrollType: string;
  endDate: Date;
  items?: PayrollItemRow[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function n(value: unknown): number {
  if (value == null) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

interface Sums {
  totalGross: number;
  bonusIncentive: number;
  igssLaboral: number;
  isr: number;
  loanDeduction: number;
  otherDeductions: number;
  netSalary: number;
  bono14Provision: number;
  aguinaldoProvision: number;
  indemnizacionProvision: number;
  vacacionesProvision: number;
  igssPatronal: number;
  irtra: number;
  intecap: number;
  totalCostoPatronal: number;
}

function sumItems(items: PayrollItemRow[]): Sums {
  const s: Sums = {
    totalGross: 0,
    bonusIncentive: 0,
    igssLaboral: 0,
    isr: 0,
    loanDeduction: 0,
    otherDeductions: 0,
    netSalary: 0,
    bono14Provision: 0,
    aguinaldoProvision: 0,
    indemnizacionProvision: 0,
    vacacionesProvision: 0,
    igssPatronal: 0,
    irtra: 0,
    intecap: 0,
    totalCostoPatronal: 0,
  };
  for (const it of items) {
    s.totalGross += n(it.totalGross);
    s.bonusIncentive += n(it.bonusIncentive);
    s.igssLaboral += n(it.igssLaboral);
    s.isr += n(it.isr);
    s.loanDeduction += n(it.loanDeduction);
    s.otherDeductions += n(it.otherDeductions);
    s.netSalary += n(it.netSalary);
    s.bono14Provision += n(it.bono14Provision);
    s.aguinaldoProvision += n(it.aguinaldoProvision);
    s.indemnizacionProvision += n(it.indemnizacionProvision);
    s.vacacionesProvision += n(it.vacacionesProvision);
    s.igssPatronal += n(it.igssPatronal);
    s.irtra += n(it.irtra);
    s.intecap += n(it.intecap);
    s.totalCostoPatronal += n(it.totalCostoPatronal);
  }
  // Redondear todos para evitar arrastre de error en partida doble.
  (Object.keys(s) as (keyof Sums)[]).forEach((k) => {
    s[k] = round2(s[k]);
  });
  return s;
}

/**
 * Construye y persiste el JournalEntry correspondiente al Payroll.
 * NO se ejecuta si ya existe (idempotencia se valida en el caller
 * verificando `Payroll.journalEntryId`). El caller debe hacerlo dentro
 * de la misma `$transaction` que actualiza Payroll.
 */
export async function generatePayrollJournalEntry(
  tx: Tx,
  payroll: PayrollRow,
  userId: string,
): Promise<{ id: string }> {
  if (!payroll.items || payroll.items.length === 0) {
    throw new JournalError('Planilla sin items: no se puede asentar.');
  }
  const sums = sumItems(payroll.items);

  type Line = {
    accountCode: string;
    debit?: number;
    credit?: number;
    description?: string;
  };
  const lines: Line[] = [];

  if (payroll.payrollType === 'REGULAR' || payroll.payrollType === 'EXTRAORDINARIA') {
    const sueldosDR = round2(sums.totalGross - sums.bonusIncentive);
    if (sueldosDR > 0) {
      lines.push({
        accountCode: ACCOUNTS.SALARIES_EXPENSE,
        debit: sueldosDR,
        description: 'Sueldos del período',
      });
    }
    if (sums.bonusIncentive > 0) {
      lines.push({
        accountCode: ACCOUNTS.BONUS_INCENTIVE,
        debit: sums.bonusIncentive,
        description: 'Bonificación incentivo (decreto 78-89)',
      });
    }
    if (sums.totalCostoPatronal > 0) {
      lines.push({
        accountCode: ACCOUNTS.IGSS_PATRONAL,
        debit: sums.totalCostoPatronal,
        description: 'Cargas patronales (IGSS 10.67% + IRTRA 1% + INTECAP 1%)',
      });
    }
    // Provisiones cargan gasto (Operating Expenses 5.3.01) — Fase 22+ puede
    // separar en cuentas dedicadas si la empresa lo prefiere.
    const totalProv = round2(
      sums.bono14Provision +
        sums.aguinaldoProvision +
        sums.indemnizacionProvision +
        sums.vacacionesProvision,
    );
    if (totalProv > 0) {
      lines.push({
        accountCode: ACCOUNTS.OPERATING_EXPENSES,
        debit: totalProv,
        description: 'Provisión mensual Bono14/Aguinaldo/Indem/Vacaciones',
      });
    }

    // CR side:
    const igssTotal = round2(sums.igssLaboral + sums.totalCostoPatronal);
    if (igssTotal > 0) {
      lines.push({
        accountCode: ACCOUNTS.IGSS_PAYABLE,
        credit: igssTotal,
        description: 'IGSS por pagar (laboral + patronal)',
      });
    }
    if (sums.isr > 0) {
      lines.push({
        accountCode: ACCOUNTS.ISR_PAYABLE,
        credit: sums.isr,
        description: 'ISR retenido por pagar',
      });
    }
    // Sueldos por Pagar: lo neto + préstamos + otras deducciones (estos
    // últimos en realidad NO van a banco pero sí compensan internamente
    // — para no descuadrar, salen por la misma cuenta de "Sueldos por
    // Pagar". La empresa, al hacer la transferencia bancaria, descarga
    // sólo el neto y mueve loanDeduction a la cuenta de préstamo al
    // empleado, otherDeductions a la cuenta que corresponda; eso lo
    // hace un asiento aparte al desembolso).
    const salariesPayableCR = round2(
      sums.netSalary + sums.loanDeduction + sums.otherDeductions,
    );
    if (salariesPayableCR > 0) {
      lines.push({
        accountCode: ACCOUNTS.SALARIES_PAYABLE,
        credit: salariesPayableCR,
        description: 'Sueldos por pagar a empleados',
      });
    }
    if (sums.bono14Provision > 0) {
      lines.push({
        accountCode: ACCOUNTS.BONUS14_PROVISION,
        credit: sums.bono14Provision,
        description: 'Provisión Bono 14',
      });
    }
    if (sums.aguinaldoProvision > 0) {
      lines.push({
        accountCode: ACCOUNTS.AGUINALDO_PROVISION,
        credit: sums.aguinaldoProvision,
        description: 'Provisión Aguinaldo',
      });
    }
    const indemPlusVac = round2(
      sums.indemnizacionProvision + sums.vacacionesProvision,
    );
    if (indemPlusVac > 0) {
      lines.push({
        accountCode: ACCOUNTS.INDEMNIZACION_PROVISION,
        credit: indemPlusVac,
        description: 'Provisión Indemnización + Vacaciones',
      });
    }
  } else if (payroll.payrollType === 'BONO14') {
    // Pago del Bono14: cancela el pasivo provisión 2.1.06.
    if (sums.totalGross > 0) {
      lines.push({
        accountCode: ACCOUNTS.BONUS14_PROVISION,
        debit: sums.totalGross,
        description: 'Cancelación provisión Bono 14 al pagar',
      });
    }
    if (sums.netSalary > 0) {
      lines.push({
        accountCode: ACCOUNTS.SALARIES_PAYABLE,
        credit: sums.netSalary,
        description: 'Bono 14 por pagar a empleados',
      });
    }
  } else if (payroll.payrollType === 'AGUINALDO') {
    if (sums.totalGross > 0) {
      lines.push({
        accountCode: ACCOUNTS.AGUINALDO_PROVISION,
        debit: sums.totalGross,
        description: 'Cancelación provisión Aguinaldo al pagar',
      });
    }
    if (sums.netSalary > 0) {
      lines.push({
        accountCode: ACCOUNTS.SALARIES_PAYABLE,
        credit: sums.netSalary,
        description: 'Aguinaldo por pagar a empleados',
      });
    }
  } else if (payroll.payrollType === 'INDEMNIZACION') {
    if (sums.totalGross > 0) {
      lines.push({
        accountCode: ACCOUNTS.INDEMNIZACION_PROVISION,
        debit: sums.totalGross,
        description: 'Cancelación provisión Indemnización al pagar',
      });
    }
    if (sums.netSalary > 0) {
      lines.push({
        accountCode: ACCOUNTS.SALARIES_PAYABLE,
        credit: sums.netSalary,
        description: 'Indemnización por pagar a empleado',
      });
    }
  }

  // Defensa última: ajustar diferencia de centavos en una de las CR si
  // hay desbalance ≤ Q0.05 (errores de redondeo distribuido).
  const totalDr = round2(lines.reduce((a, l) => a + (l.debit ?? 0), 0));
  const totalCr = round2(lines.reduce((a, l) => a + (l.credit ?? 0), 0));
  const diff = round2(totalDr - totalCr);
  if (Math.abs(diff) > 0 && Math.abs(diff) <= 0.05) {
    // Buscar una línea CR de Sueldos por Pagar y ajustar.
    const idx = lines.findIndex(
      (l) => l.accountCode === ACCOUNTS.SALARIES_PAYABLE && (l.credit ?? 0) > 0,
    );
    if (idx >= 0) {
      lines[idx].credit = round2((lines[idx].credit ?? 0) + diff);
    }
  }

  const entry = await createJournalEntry(tx, {
    companyId: payroll.companyId,
    date: payroll.endDate,
    description: `Planilla ${payroll.payrollType} · ${payroll.id.slice(0, 8)}`,
    referenceType: 'PAYROLL',
    referenceId: payroll.id,
    userId,
    posted: true,
    lines,
  });

  return { id: entry.id };
}
