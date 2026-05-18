/**
 * Fase 25-3b · Integration test de `generatePayrollJournalEntry`.
 *
 * Valida que el orquestador contable de planilla:
 *  - Crea un JournalEntry en DB con todas sus líneas.
 *  - Suma DR == Suma CR (partida doble respetada, ley contable GT).
 *  - Usa las cuentas correctas del plan (Sueldos 5.2.01, IGSS Pagar 2.1.04,
 *    Sueldos por Pagar 2.1.05, Provisiones 2.1.06/07/08).
 *  - Asocia el asiento al período contable correcto (creado automáticamente
 *    por `ensureAccountingPeriod`).
 *  - Marca referenceType='PAYROLL' + referenceId=<payroll.id> (trazabilidad).
 *
 * Tipo REGULAR (planilla mensual) cubre la mayoría del flujo del cliente.
 * Tipo BONO14 cubre el caso de "pago" (cancela provisión acumulada).
 */

import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { seedChartOfAccounts } from '@/lib/accounting/seed';
import { generatePayrollJournalEntry } from '@/lib/payroll/accounting';
import {
  createTestBase,
  createTestEmployee,
  createTestPayroll,
  createTestPayrollItem,
} from '@/test-utils/integration-fixtures';

describe('generatePayrollJournalEntry · integration', () => {
  it('REGULAR: crea JournalEntry balanceado con cuentas de Sueldos/IGSS/ISR/Provisiones', async () => {
    const { company, branch, user } = await createTestBase();
    await seedChartOfAccounts(prisma, company.id);

    const employee = await createTestEmployee(company.id, branch.id, {
      baseSalary: 5000,
      bonusIncentive: 250,
    });
    const payroll = await createTestPayroll(company.id, {
      payrollType: 'REGULAR',
      endDate: new Date('2026-05-31'),
    });
    await createTestPayrollItem(payroll.id, employee.id, {
      baseSalary: 5000,
      bonusIncentive: 250,
      totalGross: 5250, // base + bonus
      igssLaboral: 241.5, // 5000 * 4.83%
      isr: 0,
      totalDeductions: 241.5,
      netSalary: 5008.5,
      bono14Provision: 416.67, // 5000/12
      aguinaldoProvision: 416.67,
      indemnizacionProvision: 416.67,
      vacacionesProvision: 208.33, // 5000/24
      igssPatronal: 533.5, // 5000 * 10.67%
      irtra: 50,
      intecap: 50,
      totalCostoPatronal: 633.5,
    });

    // Re-cargar con items (generatePayrollJournalEntry los lee del objeto).
    const payrollWithItems = await prisma.payroll.findUnique({
      where: { id: payroll.id },
      include: { items: true },
    });
    expect(payrollWithItems).not.toBeNull();

    const result = await prisma.$transaction(async (tx) => {
      return generatePayrollJournalEntry(
        tx,
        {
          id: payrollWithItems!.id,
          companyId: payrollWithItems!.companyId,
          payrollType: payrollWithItems!.payrollType,
          endDate: payrollWithItems!.endDate,
          items: payrollWithItems!.items,
        },
        user.id,
      );
    });

    expect(result.id).toBeDefined();

    const entry = await prisma.journalEntry.findUnique({
      where: { id: result.id },
      include: {
        lines: { include: { account: { select: { code: true } } } },
      },
    });
    expect(entry).not.toBeNull();
    expect(entry!.referenceType).toBe('PAYROLL');
    expect(entry!.referenceId).toBe(payroll.id);
    expect(entry!.companyId).toBe(company.id);
    expect(entry!.posted).toBe(true);

    // Partida doble: Σ DR == Σ CR.
    const totalDr = entry!.lines.reduce((a, l) => a + Number(l.debit), 0);
    const totalCr = entry!.lines.reduce((a, l) => a + Number(l.credit), 0);
    expect(totalDr).toBeGreaterThan(0);
    expect(totalDr).toBeCloseTo(totalCr, 2);

    // Cuentas esperadas en REGULAR.
    const codes = entry!.lines.map((l) => l.account.code);
    expect(codes).toContain('5.2.01'); // Sueldos y Salarios
    expect(codes).toContain('5.2.03'); // Bonificación Incentivo
    expect(codes).toContain('5.2.02'); // IGSS Patronal (gasto)
    expect(codes).toContain('5.3.01'); // Operating Expenses (provisiones)
    expect(codes).toContain('2.1.04'); // IGSS por Pagar
    expect(codes).toContain('2.1.05'); // Sueldos por Pagar
    expect(codes).toContain('2.1.06'); // Provisión Bono14
    expect(codes).toContain('2.1.07'); // Provisión Aguinaldo
    expect(codes).toContain('2.1.08'); // Provisión Indemnización + Vacaciones
  });

  it('BONO14: asiento minimal cancela provisión acumulada', async () => {
    const { company, branch, user } = await createTestBase();
    await seedChartOfAccounts(prisma, company.id);

    const employee = await createTestEmployee(company.id, branch.id, {
      baseSalary: 5000,
    });
    const payroll = await createTestPayroll(company.id, {
      payrollType: 'BONO14',
      name: 'Bono 14 - 2026',
      endDate: new Date('2026-07-15'),
    });
    await createTestPayrollItem(payroll.id, employee.id, {
      baseSalary: 5000,
      bonusIncentive: 0, // Bono14 no incluye bonificación incentivo
      totalGross: 5000,
      igssLaboral: 0, // Bono14 es exento IGSS
      isr: 0, // y exento ISR
      totalDeductions: 0,
      netSalary: 5000,
      // Provisiones en 0 (las provisiones solo se acumulan en REGULAR).
      bono14Provision: 0,
      aguinaldoProvision: 0,
      indemnizacionProvision: 0,
      vacacionesProvision: 0,
      igssPatronal: 0,
      irtra: 0,
      intecap: 0,
      totalCostoPatronal: 0,
    });

    const payrollWithItems = await prisma.payroll.findUnique({
      where: { id: payroll.id },
      include: { items: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      return generatePayrollJournalEntry(
        tx,
        {
          id: payrollWithItems!.id,
          companyId: payrollWithItems!.companyId,
          payrollType: payrollWithItems!.payrollType,
          endDate: payrollWithItems!.endDate,
          items: payrollWithItems!.items,
        },
        user.id,
      );
    });

    const entry = await prisma.journalEntry.findUnique({
      where: { id: result.id },
      include: {
        lines: { include: { account: { select: { code: true } } } },
      },
    });
    expect(entry).not.toBeNull();

    const totalDr = entry!.lines.reduce((a, l) => a + Number(l.debit), 0);
    const totalCr = entry!.lines.reduce((a, l) => a + Number(l.credit), 0);
    expect(totalDr).toBeCloseTo(5000, 2);
    expect(totalCr).toBeCloseTo(5000, 2);

    const codes = entry!.lines.map((l) => l.account.code);
    expect(codes).toContain('2.1.06'); // Provisión Bono 14 (DR cancela pasivo)
    expect(codes).toContain('2.1.05'); // Sueldos por Pagar (CR)
  });

  it('crea AccountingPeriod automáticamente si no existe (ensureAccountingPeriod)', async () => {
    const { company, branch, user } = await createTestBase();
    await seedChartOfAccounts(prisma, company.id);

    const employee = await createTestEmployee(company.id, branch.id);
    const payroll = await createTestPayroll(company.id, {
      payrollType: 'REGULAR',
      endDate: new Date('2026-03-31'), // marzo
    });
    await createTestPayrollItem(payroll.id, employee.id);

    const payrollWithItems = await prisma.payroll.findUnique({
      where: { id: payroll.id },
      include: { items: true },
    });

    // Verificar que NO existe el período marzo antes del asiento.
    const periodsBefore = await prisma.accountingPeriod.count({
      where: { companyId: company.id, year: 2026, month: 3 },
    });
    expect(periodsBefore).toBe(0);

    await prisma.$transaction(async (tx) => {
      await generatePayrollJournalEntry(
        tx,
        {
          id: payrollWithItems!.id,
          companyId: payrollWithItems!.companyId,
          payrollType: payrollWithItems!.payrollType,
          endDate: payrollWithItems!.endDate,
          items: payrollWithItems!.items,
        },
        user.id,
      );
    });

    // Período marzo 2026 fue creado OPEN automáticamente.
    const periodAfter = await prisma.accountingPeriod.findFirst({
      where: { companyId: company.id, year: 2026, month: 3 },
    });
    expect(periodAfter).not.toBeNull();
    expect(periodAfter!.status).toBe('OPEN');
  });
});
