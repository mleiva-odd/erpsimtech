import { describe, it, expect } from 'vitest';
import { ACCOUNTS } from '../accounts';
import { CHART_OF_ACCOUNTS_SEED } from '../seed';

/**
 * Test de la regla determinística de migración legacy → JournalEntry.
 * Documenta el mapping aplicado por la migración SQL en
 *   prisma/migrations/20260512000000_chart_of_accounts_and_journal/
 *
 * Reglas:
 *   INCOME  → DR Caja (1.1.01)        / CR Ventas (4.1.01)
 *   EXPENSE → DR Gastos Op (5.3.01)   / CR Caja (1.1.01)
 *   Si bankTransactionId está seteado, Caja → Bancos (1.1.02).
 */

type LegacyEntry = {
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  bankTransactionId?: string | null;
};

function applyMigrationRule(e: LegacyEntry): Array<{ accountCode: string; debit: number; credit: number }> {
  const cashCode = e.bankTransactionId ? ACCOUNTS.BANKS : ACCOUNTS.CASH;
  if (e.type === 'INCOME') {
    return [
      { accountCode: cashCode, debit: e.amount, credit: 0 },
      { accountCode: ACCOUNTS.SALES, debit: 0, credit: e.amount },
    ];
  } else {
    return [
      { accountCode: ACCOUNTS.OPERATING_EXPENSES, debit: e.amount, credit: 0 },
      { accountCode: cashCode, debit: 0, credit: e.amount },
    ];
  }
}

describe('Migración legacy → JournalEntry (regla determinística)', () => {
  it('INCOME Q1000 → DR Caja 1000 / CR Ventas 1000', () => {
    const lines = applyMigrationRule({ type: 'INCOME', amount: 1000 });
    expect(lines).toEqual([
      { accountCode: ACCOUNTS.CASH, debit: 1000, credit: 0 },
      { accountCode: ACCOUNTS.SALES, debit: 0, credit: 1000 },
    ]);
  });

  it('EXPENSE Q500 → DR Gastos Op 500 / CR Caja 500', () => {
    const lines = applyMigrationRule({ type: 'EXPENSE', amount: 500 });
    expect(lines).toEqual([
      { accountCode: ACCOUNTS.OPERATING_EXPENSES, debit: 500, credit: 0 },
      { accountCode: ACCOUNTS.CASH, debit: 0, credit: 500 },
    ]);
  });

  it('INCOME con bankTransactionId → DR Bancos / CR Ventas', () => {
    const lines = applyMigrationRule({
      type: 'INCOME',
      amount: 1500,
      bankTransactionId: 'bt-1',
    });
    expect(lines[0]?.accountCode).toBe(ACCOUNTS.BANKS);
    expect(lines[1]?.accountCode).toBe(ACCOUNTS.SALES);
  });

  it('EXPENSE con bankTransactionId → DR Gastos / CR Bancos', () => {
    const lines = applyMigrationRule({
      type: 'EXPENSE',
      amount: 800,
      bankTransactionId: 'bt-2',
    });
    expect(lines[0]?.accountCode).toBe(ACCOUNTS.OPERATING_EXPENSES);
    expect(lines[1]?.accountCode).toBe(ACCOUNTS.BANKS);
  });

  it('todas las cuentas referenciadas por la migración están en el seed', () => {
    const usedCodes = [ACCOUNTS.CASH, ACCOUNTS.BANKS, ACCOUNTS.SALES, ACCOUNTS.OPERATING_EXPENSES];
    for (const code of usedCodes) {
      const acct = CHART_OF_ACCOUNTS_SEED.find((a) => a.code === code);
      expect(acct, `Cuenta ${code} debe existir en el seed`).toBeDefined();
      expect(acct?.isPosting, `Cuenta ${code} debe ser posting`).toBe(true);
    }
  });

  it('siempre genera 2 líneas que balancean (DR == CR)', () => {
    const cases: LegacyEntry[] = [
      { type: 'INCOME', amount: 100 },
      { type: 'EXPENSE', amount: 200.50 },
      { type: 'INCOME', amount: 0.01, bankTransactionId: 'bt-x' },
    ];
    for (const c of cases) {
      const lines = applyMigrationRule(c);
      expect(lines.length).toBe(2);
      const dr = lines.reduce((s, l) => s + l.debit, 0);
      const cr = lines.reduce((s, l) => s + l.credit, 0);
      expect(dr).toBeCloseTo(cr, 2);
      expect(dr).toBeCloseTo(c.amount, 2);
    }
  });
});
