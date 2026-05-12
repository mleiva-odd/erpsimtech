import { describe, it, expect } from 'vitest';
import { createJournalEntry, reverseJournalEntry } from '../journal';
import { ACCOUNTS } from '../accounts';
import { makeMockTx } from './mock-tx';

const COMPANY = 'company-1';
const USER = 'user-1';

const seedAccounts = [
  { companyId: COMPANY, code: ACCOUNTS.CASH, name: 'Caja', type: 'ASSET' as const, isPosting: true, active: true, parentId: null },
  { companyId: COMPANY, code: ACCOUNTS.SALES, name: 'Ventas', type: 'INCOME' as const, isPosting: true, active: true, parentId: null },
  { companyId: COMPANY, code: ACCOUNTS.AR, name: 'Clientes', type: 'ASSET' as const, isPosting: true, active: true, parentId: null },
];

describe('reverseJournalEntry', () => {
  it('produce un asiento con líneas invertidas (DR↔CR) en las mismas cuentas', async () => {
    const tx = makeMockTx(seedAccounts);
    const original = await createJournalEntry(tx as any, {
      companyId: COMPANY,
      date: new Date('2026-05-15T12:00:00Z'),
      description: 'Venta original',
      userId: USER,
      lines: [
        { accountCode: ACCOUNTS.CASH, debit: 1000 },
        { accountCode: ACCOUNTS.SALES, credit: 1000 },
      ],
    });

    const reversal = await reverseJournalEntry(tx as any, original.id, {
      companyId: COMPANY,
      userId: USER,
      description: 'Anulación de venta',
    });

    expect(reversal.lines.length).toBe(2);
    // La línea que originalmente fue DR Caja ahora debe ser CR Caja
    const cashLine = reversal.lines.find((l: any) => {
      const acct = tx._state.accounts.find((a: any) => a.id === l.accountId);
      return acct?.code === ACCOUNTS.CASH;
    });
    const salesLine = reversal.lines.find((l: any) => {
      const acct = tx._state.accounts.find((a: any) => a.id === l.accountId);
      return acct?.code === ACCOUNTS.SALES;
    });
    expect(Number(cashLine!.debit)).toBe(0);
    expect(Number(cashLine!.credit)).toBe(1000);
    expect(Number(salesLine!.debit)).toBe(1000);
    expect(Number(salesLine!.credit)).toBe(0);
  });

  it('marca reversedById en el nuevo asiento', async () => {
    const tx = makeMockTx(seedAccounts);
    const original = await createJournalEntry(tx as any, {
      companyId: COMPANY,
      date: new Date('2026-05-15T12:00:00Z'),
      description: 'Original',
      userId: USER,
      lines: [
        { accountCode: ACCOUNTS.CASH, debit: 500 },
        { accountCode: ACCOUNTS.SALES, credit: 500 },
      ],
    });
    const reversal = await reverseJournalEntry(tx as any, original.id, {
      companyId: COMPANY,
      userId: USER,
      description: 'Reverso',
    });
    const stored = tx._state.entries.find((e: any) => e.id === reversal.id);
    expect(stored?.reversedById).toBe(original.id);
  });

  it('bloquea doble reversa del mismo asiento', async () => {
    const tx = makeMockTx(seedAccounts);
    const original = await createJournalEntry(tx as any, {
      companyId: COMPANY,
      date: new Date('2026-05-15T12:00:00Z'),
      description: 'Original',
      userId: USER,
      lines: [
        { accountCode: ACCOUNTS.CASH, debit: 200 },
        { accountCode: ACCOUNTS.SALES, credit: 200 },
      ],
    });
    await reverseJournalEntry(tx as any, original.id, {
      companyId: COMPANY,
      userId: USER,
      description: 'Reverso 1',
    });
    await expect(
      reverseJournalEntry(tx as any, original.id, {
        companyId: COMPANY,
        userId: USER,
        description: 'Reverso 2 (debería fallar)',
      }),
    ).rejects.toThrow(/ya fue reversado/);
  });
});

describe('Anulación de venta (CRIT-2) — patrón de uso', () => {
  it('reversar venta NO crea EXPENSE paralelo (queda solo el asiento contrario)', async () => {
    const tx = makeMockTx(seedAccounts);

    // Simula la creación del asiento de venta original.
    const saleEntry = await createJournalEntry(tx as any, {
      companyId: COMPANY,
      date: new Date('2026-05-15T12:00:00Z'),
      description: 'Venta #ABC',
      referenceType: 'SALE',
      referenceId: 'sale-1',
      userId: USER,
      lines: [
        { accountCode: ACCOUNTS.CASH, debit: 1000 },
        { accountCode: ACCOUNTS.SALES, credit: 1000 },
      ],
    });

    // Simula anulación de la venta usando reverseJournalEntry (patrón nuevo,
    // NO el viejo de createAccountingEntry con EXPENSE "Devoluciones POS").
    await reverseJournalEntry(tx as any, saleEntry.id, {
      companyId: COMPANY,
      userId: USER,
      description: 'Anulación de Venta #ABC',
      referenceType: 'SALE_CANCEL',
      referenceId: 'sale-1',
    });

    // Verifica: exactamente 2 asientos (venta + reversa), no 3.
    expect(tx._state.entries.length).toBe(2);
    // Ninguno toca una cuenta EXPENSE — esto demuestra que NO se está
    // creando un "Devoluciones POS" paralelo.
    for (const e of tx._state.entries) {
      for (const l of e.lines) {
        const acct = tx._state.accounts.find((a: any) => a.id === l.accountId);
        expect(acct?.type).not.toBe('EXPENSE');
      }
    }
  });
});
