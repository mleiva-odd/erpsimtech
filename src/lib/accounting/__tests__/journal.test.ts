import { describe, it, expect } from 'vitest';
import { createJournalEntry, JournalError } from '../journal';
import { ACCOUNTS } from '../accounts';
import { makeMockTx } from './mock-tx';

const COMPANY = 'company-1';
const USER = 'user-1';

function seedMinimal() {
  // Cuentas mínimas que `createJournalEntry` puede llegar a buscar en estos tests.
  return [
    { companyId: COMPANY, code: ACCOUNTS.CASH, name: 'Caja', type: 'ASSET' as const, isPosting: true, active: true, parentId: null },
    { companyId: COMPANY, code: ACCOUNTS.BANKS, name: 'Bancos', type: 'ASSET' as const, isPosting: true, active: true, parentId: null },
    { companyId: COMPANY, code: ACCOUNTS.SALES, name: 'Ventas', type: 'INCOME' as const, isPosting: true, active: true, parentId: null },
    { companyId: COMPANY, code: ACCOUNTS.AR, name: 'Clientes', type: 'ASSET' as const, isPosting: true, active: true, parentId: null },
    { companyId: COMPANY, code: '1.1', name: 'Activo Corriente', type: 'ASSET' as const, isPosting: false, active: true, parentId: null },
    { companyId: COMPANY, code: ACCOUNTS.OPERATING_EXPENSES, name: 'Gastos Operativos', type: 'EXPENSE' as const, isPosting: true, active: true, parentId: null },
    { companyId: COMPANY, code: ACCOUNTS.VAT_OUTPUT, name: 'IVA Débito', type: 'LIABILITY' as const, isPosting: true, active: true, parentId: null },
  ];
}

describe('createJournalEntry', () => {
  it('crea un asiento balanceado (DR == CR)', async () => {
    const tx = makeMockTx(seedMinimal());
    const entry = await createJournalEntry(tx as any, {
      companyId: COMPANY,
      date: new Date('2026-05-15T12:00:00Z'),
      description: 'Venta Q1000',
      userId: USER,
      lines: [
        { accountCode: ACCOUNTS.CASH, debit: 1000 },
        { accountCode: ACCOUNTS.SALES, credit: 1000 },
      ],
    });
    expect(entry.lines.length).toBe(2);
    expect(entry.posted).toBe(true);
    expect(entry.postedAt).not.toBeNull();
  });

  it('falla si DR != CR fuera de tolerancia', async () => {
    const tx = makeMockTx(seedMinimal());
    await expect(
      createJournalEntry(tx as any, {
        companyId: COMPANY,
        date: new Date('2026-05-15T12:00:00Z'),
        description: 'Asiento mal',
        userId: USER,
        lines: [
          { accountCode: ACCOUNTS.CASH, debit: 1000 },
          { accountCode: ACCOUNTS.SALES, credit: 900 },
        ],
      }),
    ).rejects.toThrow(JournalError);
  });

  it('acepta tolerancia de centavos (DR=10.0001, CR=10.0)', async () => {
    const tx = makeMockTx(seedMinimal());
    const entry = await createJournalEntry(tx as any, {
      companyId: COMPANY,
      date: new Date('2026-05-15T12:00:00Z'),
      description: 'Venta con redondeo',
      userId: USER,
      lines: [
        { accountCode: ACCOUNTS.CASH, debit: 10.0001 },
        { accountCode: ACCOUNTS.SALES, credit: 10.0 },
      ],
    });
    expect(entry.id).toBeDefined();
  });

  it('falla si una cuenta no existe', async () => {
    const tx = makeMockTx(seedMinimal());
    await expect(
      createJournalEntry(tx as any, {
        companyId: COMPANY,
        date: new Date('2026-05-15T12:00:00Z'),
        description: 'Cuenta inexistente',
        userId: USER,
        lines: [
          { accountCode: '9.9.99', debit: 100 },
          { accountCode: ACCOUNTS.SALES, credit: 100 },
        ],
      }),
    ).rejects.toThrow(/no existe/);
  });

  it('falla si una línea apunta a cuenta no-posting (padre)', async () => {
    const tx = makeMockTx(seedMinimal());
    await expect(
      createJournalEntry(tx as any, {
        companyId: COMPANY,
        date: new Date('2026-05-15T12:00:00Z'),
        description: 'Línea a padre',
        userId: USER,
        lines: [
          { accountCode: '1.1', debit: 100 },
          { accountCode: ACCOUNTS.SALES, credit: 100 },
        ],
      }),
    ).rejects.toThrow(/no-posting/);
  });

  it('falla con 409 si el período está CLOSED', async () => {
    const tx = makeMockTx(seedMinimal());
    // Pre-creamos el período como CLOSED
    tx._state.periods.push({
      id: 'p-1',
      companyId: COMPANY,
      year: 2026,
      month: 5,
      status: 'CLOSED',
    });
    try {
      await createJournalEntry(tx as any, {
        companyId: COMPANY,
        date: new Date('2026-05-15T12:00:00Z'),
        description: 'Después de cierre',
        userId: USER,
        lines: [
          { accountCode: ACCOUNTS.CASH, debit: 100 },
          { accountCode: ACCOUNTS.SALES, credit: 100 },
        ],
      });
      throw new Error('debería haber tirado JournalError');
    } catch (e) {
      expect(e).toBeInstanceOf(JournalError);
      expect((e as JournalError).status).toBe(409);
    }
  });

  it('falla si una línea tiene DR y CR simultáneamente', async () => {
    const tx = makeMockTx(seedMinimal());
    await expect(
      createJournalEntry(tx as any, {
        companyId: COMPANY,
        date: new Date('2026-05-15T12:00:00Z'),
        description: 'Doble pierna',
        userId: USER,
        lines: [
          { accountCode: ACCOUNTS.CASH, debit: 100, credit: 100 },
          { accountCode: ACCOUNTS.SALES, credit: 100 },
        ],
      }),
    ).rejects.toThrow(/débito y crédito a la vez/);
  });

  it('soporta múltiples líneas (DR Caja, CR Ventas, CR IVA)', async () => {
    const tx = makeMockTx(seedMinimal());
    const entry = await createJournalEntry(tx as any, {
      companyId: COMPANY,
      date: new Date('2026-05-15T12:00:00Z'),
      description: 'Venta con IVA',
      userId: USER,
      lines: [
        { accountCode: ACCOUNTS.CASH, debit: 1120 },
        { accountCode: ACCOUNTS.SALES, credit: 1000 },
        { accountCode: ACCOUNTS.VAT_OUTPUT, credit: 120 },
      ],
    });
    expect(entry.lines.length).toBe(3);
  });

  it('crea período OPEN automáticamente si no existe', async () => {
    const tx = makeMockTx(seedMinimal());
    expect(tx._state.periods.length).toBe(0);
    await createJournalEntry(tx as any, {
      companyId: COMPANY,
      date: new Date('2026-08-10T12:00:00Z'),
      description: 'Mes futuro',
      userId: USER,
      lines: [
        { accountCode: ACCOUNTS.CASH, debit: 100 },
        { accountCode: ACCOUNTS.SALES, credit: 100 },
      ],
    });
    expect(tx._state.periods.length).toBe(1);
    expect(tx._state.periods[0]?.year).toBe(2026);
    expect(tx._state.periods[0]?.month).toBe(8);
    expect(tx._state.periods[0]?.status).toBe('OPEN');
  });

  it('respeta posted=false (DRAFT)', async () => {
    const tx = makeMockTx(seedMinimal());
    const entry = await createJournalEntry(tx as any, {
      companyId: COMPANY,
      date: new Date('2026-05-15T12:00:00Z'),
      description: 'Borrador',
      userId: USER,
      posted: false,
      lines: [
        { accountCode: ACCOUNTS.CASH, debit: 50 },
        { accountCode: ACCOUNTS.SALES, credit: 50 },
      ],
    });
    expect(entry.posted).toBe(false);
    expect(entry.postedAt).toBeNull();
  });
});
