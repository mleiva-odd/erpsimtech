import { describe, it, expect } from 'vitest';
import { ACCOUNTS } from '@/lib/accounting/accounts';

// Para evitar el ruido de mockear `createJournalEntry` con vi.mock, este
// test stubea el módulo replicando `accounting.ts` en modo "dry-run": en
// lugar de llamar a `createJournalEntry`, expone una función paralela
// `buildPayrollJournalLines` que construye y devuelve el array de líneas
// sin tocar DB. Validamos balance Σ DR == Σ CR y que las cuentas correctas
// aparecen.

/**
 * Versión inlined de `accounting.ts` que NO llama a createJournalEntry,
 * sólo devuelve las líneas computadas. Esto permite testear la composición
 * del asiento sin mocks de módulo.
 *
 * Mantener en sincronía con `src/lib/payroll/accounting.ts`.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function num(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface Line {
  accountCode: string;
  debit?: number;
  credit?: number;
}

function buildPayrollJournalLines(payroll: {
  payrollType: string;
  items: Array<Record<string, unknown>>;
}): Line[] {
  const sums = {
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
  for (const it of payroll.items) {
    sums.totalGross += num(it.totalGross);
    sums.bonusIncentive += num(it.bonusIncentive);
    sums.igssLaboral += num(it.igssLaboral);
    sums.isr += num(it.isr);
    sums.loanDeduction += num(it.loanDeduction);
    sums.otherDeductions += num(it.otherDeductions);
    sums.netSalary += num(it.netSalary);
    sums.bono14Provision += num(it.bono14Provision);
    sums.aguinaldoProvision += num(it.aguinaldoProvision);
    sums.indemnizacionProvision += num(it.indemnizacionProvision);
    sums.vacacionesProvision += num(it.vacacionesProvision);
    sums.igssPatronal += num(it.igssPatronal);
    sums.irtra += num(it.irtra);
    sums.intecap += num(it.intecap);
    sums.totalCostoPatronal += num(it.totalCostoPatronal);
  }
  (Object.keys(sums) as Array<keyof typeof sums>).forEach((k) => {
    sums[k] = round2(sums[k]);
  });

  const lines: Line[] = [];
  if (payroll.payrollType === 'REGULAR' || payroll.payrollType === 'EXTRAORDINARIA') {
    const sueldosDR = round2(sums.totalGross - sums.bonusIncentive);
    if (sueldosDR > 0) lines.push({ accountCode: ACCOUNTS.SALARIES_EXPENSE, debit: sueldosDR });
    if (sums.bonusIncentive > 0) lines.push({ accountCode: ACCOUNTS.BONUS_INCENTIVE, debit: sums.bonusIncentive });
    if (sums.totalCostoPatronal > 0) lines.push({ accountCode: ACCOUNTS.IGSS_PATRONAL, debit: sums.totalCostoPatronal });
    const totalProv = round2(
      sums.bono14Provision +
        sums.aguinaldoProvision +
        sums.indemnizacionProvision +
        sums.vacacionesProvision,
    );
    if (totalProv > 0) lines.push({ accountCode: ACCOUNTS.OPERATING_EXPENSES, debit: totalProv });
    const igssTotal = round2(sums.igssLaboral + sums.totalCostoPatronal);
    if (igssTotal > 0) lines.push({ accountCode: ACCOUNTS.IGSS_PAYABLE, credit: igssTotal });
    if (sums.isr > 0) lines.push({ accountCode: ACCOUNTS.ISR_PAYABLE, credit: sums.isr });
    const salariesPayableCR = round2(sums.netSalary + sums.loanDeduction + sums.otherDeductions);
    if (salariesPayableCR > 0) lines.push({ accountCode: ACCOUNTS.SALARIES_PAYABLE, credit: salariesPayableCR });
    if (sums.bono14Provision > 0) lines.push({ accountCode: ACCOUNTS.BONUS14_PROVISION, credit: sums.bono14Provision });
    if (sums.aguinaldoProvision > 0) lines.push({ accountCode: ACCOUNTS.AGUINALDO_PROVISION, credit: sums.aguinaldoProvision });
    const indemPlusVac = round2(sums.indemnizacionProvision + sums.vacacionesProvision);
    if (indemPlusVac > 0) lines.push({ accountCode: ACCOUNTS.INDEMNIZACION_PROVISION, credit: indemPlusVac });
  } else if (payroll.payrollType === 'BONO14') {
    if (sums.totalGross > 0) lines.push({ accountCode: ACCOUNTS.BONUS14_PROVISION, debit: sums.totalGross });
    if (sums.netSalary > 0) lines.push({ accountCode: ACCOUNTS.SALARIES_PAYABLE, credit: sums.netSalary });
  } else if (payroll.payrollType === 'AGUINALDO') {
    if (sums.totalGross > 0) lines.push({ accountCode: ACCOUNTS.AGUINALDO_PROVISION, debit: sums.totalGross });
    if (sums.netSalary > 0) lines.push({ accountCode: ACCOUNTS.SALARIES_PAYABLE, credit: sums.netSalary });
  } else if (payroll.payrollType === 'INDEMNIZACION') {
    if (sums.totalGross > 0) lines.push({ accountCode: ACCOUNTS.INDEMNIZACION_PROVISION, debit: sums.totalGross });
    if (sums.netSalary > 0) lines.push({ accountCode: ACCOUNTS.SALARIES_PAYABLE, credit: sums.netSalary });
  }
  // Ajuste defensivo de centavos.
  const totalDr = round2(lines.reduce((a, l) => a + (l.debit ?? 0), 0));
  const totalCr = round2(lines.reduce((a, l) => a + (l.credit ?? 0), 0));
  const diff = round2(totalDr - totalCr);
  if (Math.abs(diff) > 0 && Math.abs(diff) <= 0.05) {
    const idx = lines.findIndex(
      (l) => l.accountCode === ACCOUNTS.SALARIES_PAYABLE && (l.credit ?? 0) > 0,
    );
    if (idx >= 0) {
      lines[idx].credit = round2((lines[idx].credit ?? 0) + diff);
    }
  }
  return lines;
}

function totalDr(lines: Line[]): number {
  return Math.round(lines.reduce((a, l) => a + (l.debit ?? 0), 0) * 100) / 100;
}
function totalCr(lines: Line[]): number {
  return Math.round(lines.reduce((a, l) => a + (l.credit ?? 0), 0) * 100) / 100;
}

describe('payroll/accounting · partida doble', () => {
  it('REGULAR Q100k bruto: asiento cuadra DR == CR', () => {
    const items = Array.from({ length: 10 }).map(() => ({
      baseSalary: 10000,
      bonusIncentive: 250,
      totalGross: 10250,
      igssLaboral: 483,
      isr: 50,
      loanDeduction: 0,
      otherDeductions: 0,
      totalDeductions: 533,
      netSalary: 9717,
      bono14Provision: 833.33,
      aguinaldoProvision: 833.33,
      indemnizacionProvision: 833.33,
      vacacionesProvision: 416.67,
      igssPatronal: 1067,
      irtra: 100,
      intecap: 100,
      totalCostoPatronal: 1267,
    }));
    const lines = buildPayrollJournalLines({ payrollType: 'REGULAR', items });
    expect(totalDr(lines)).toBe(totalCr(lines));

    const codes = new Set(lines.map((l) => l.accountCode));
    expect(codes.has(ACCOUNTS.SALARIES_EXPENSE)).toBe(true);
    expect(codes.has(ACCOUNTS.BONUS_INCENTIVE)).toBe(true);
    expect(codes.has(ACCOUNTS.IGSS_PATRONAL)).toBe(true);
    expect(codes.has(ACCOUNTS.IGSS_PAYABLE)).toBe(true);
    expect(codes.has(ACCOUNTS.ISR_PAYABLE)).toBe(true);
    expect(codes.has(ACCOUNTS.SALARIES_PAYABLE)).toBe(true);
    expect(codes.has(ACCOUNTS.BONUS14_PROVISION)).toBe(true);
    expect(codes.has(ACCOUNTS.AGUINALDO_PROVISION)).toBe(true);
    expect(codes.has(ACCOUNTS.INDEMNIZACION_PROVISION)).toBe(true);
  });

  it('BONO14: DR Provisión Bono14 / CR Sueldos por Pagar', () => {
    const lines = buildPayrollJournalLines({
      payrollType: 'BONO14',
      items: [
        {
          totalGross: 5000,
          netSalary: 5000,
        },
      ],
    });
    expect(totalDr(lines)).toBe(totalCr(lines));
    const codes = lines.map((l) => l.accountCode);
    expect(codes).toContain(ACCOUNTS.BONUS14_PROVISION);
    expect(codes).toContain(ACCOUNTS.SALARIES_PAYABLE);
  });

  it('INDEMNIZACION usa cuenta Provisión Indemnización', () => {
    const lines = buildPayrollJournalLines({
      payrollType: 'INDEMNIZACION',
      items: [
        {
          totalGross: 17500,
          netSalary: 17500,
        },
      ],
    });
    expect(totalDr(lines)).toBe(totalCr(lines));
    expect(lines.map((l) => l.accountCode)).toContain(
      ACCOUNTS.INDEMNIZACION_PROVISION,
    );
  });

  it('ajuste de centavos: línea Sueldos por Pagar absorbe redondeo ≤Q0.05', () => {
    // Caso artificial donde DR=100.00 y CR sin ajuste=99.97 (-0.03)
    const items = [
      {
        baseSalary: 99.97,
        bonusIncentive: 0,
        totalGross: 100,
        igssLaboral: 0,
        isr: 0,
        loanDeduction: 0,
        otherDeductions: 0,
        netSalary: 99.97,
        bono14Provision: 0,
        aguinaldoProvision: 0,
        indemnizacionProvision: 0,
        vacacionesProvision: 0,
        igssPatronal: 0,
        irtra: 0,
        intecap: 0,
        totalCostoPatronal: 0,
      },
    ];
    const lines = buildPayrollJournalLines({ payrollType: 'REGULAR', items });
    // DR == CR tras ajuste (la diff de 0.03 se absorbe en Sueldos por Pagar).
    expect(totalDr(lines)).toBe(totalCr(lines));
  });
});
