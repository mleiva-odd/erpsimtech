import { describe, it, expect } from 'vitest';
import { buildSupplierInvoiceJournalLines } from '../accounting';
import { ACCOUNTS } from '@/lib/accounting/accounts';

function sumDebits(
  lines: ReturnType<typeof buildSupplierInvoiceJournalLines>,
): number {
  return lines.reduce((acc, l) => acc + (l.debit ?? 0), 0);
}
function sumCredits(
  lines: ReturnType<typeof buildSupplierInvoiceJournalLines>,
): number {
  return lines.reduce((acc, l) => acc + (l.credit ?? 0), 0);
}

describe('purchases/accounting · buildSupplierInvoiceJournalLines', () => {
  it('Caso GENERAL sin retenciones: DR Inv+IVA / CR AP — balance OK', () => {
    const lines = buildSupplierInvoiceJournalLines({
      subtotal: 1000,
      tax: 120,
      withheldIVA: 0,
      withheldISR: 0,
    });
    const dr = sumDebits(lines);
    const cr = sumCredits(lines);
    expect(dr).toBe(1120);
    expect(cr).toBe(1120);
    expect(Math.abs(dr - cr)).toBeLessThan(0.005);
  });

  it('Caso PC (sin IVA débito) sin retenciones: DR Inv 1000 / CR AP 1000', () => {
    const lines = buildSupplierInvoiceJournalLines({
      subtotal: 1000,
      tax: 0,
      withheldIVA: 0,
      withheldISR: 0,
    });
    expect(sumDebits(lines)).toBe(1000);
    expect(sumCredits(lines)).toBe(1000);
  });

  it('Caso PC con retención IVA 5%: balance se mantiene', () => {
    // PC, subtotal 1000, retención IVA 50
    // DR Inv 1000 / CR AP 950 + CR IVA Débito 50
    const lines = buildSupplierInvoiceJournalLines({
      subtotal: 1000,
      tax: 0,
      withheldIVA: 50,
      withheldISR: 0,
    });
    const dr = sumDebits(lines);
    const cr = sumCredits(lines);
    expect(dr).toBe(1000);
    expect(cr).toBe(1000); // 950 AP + 50 IVA Débito
    const ivaOutput = lines.find((l) => l.accountCode === ACCOUNTS.VAT_OUTPUT);
    expect(ivaOutput?.credit).toBe(50);
    const ap = lines.find((l) => l.accountCode === ACCOUNTS.AP);
    expect(ap?.credit).toBe(950);
  });

  it('Caso GENERAL con retención ISR 5%: balance OK', () => {
    // Subtotal 10000, IVA 1200, ISR 500
    // DR Inv 10000 + IVA Crédito 1200 = 11200
    // CR AP (10000+1200-500)=10700 + ISR Retenido 500 = 11200
    const lines = buildSupplierInvoiceJournalLines({
      subtotal: 10000,
      tax: 1200,
      withheldIVA: 0,
      withheldISR: 500,
    });
    expect(sumDebits(lines)).toBe(11200);
    expect(sumCredits(lines)).toBe(11200);
    const isr = lines.find((l) => l.accountCode === ACCOUNTS.ISR_PAYABLE);
    expect(isr?.credit).toBe(500);
  });

  it('Caso doble retención (IVA + ISR): balance OK', () => {
    // PC servicios: subtotal 2000, ret IVA 100, ret ISR 100, sin IVA débito
    // DR Inv 2000 / CR AP 1800 + CR IVA Débito 100 + CR ISR Ret 100
    const lines = buildSupplierInvoiceJournalLines({
      subtotal: 2000,
      tax: 0,
      withheldIVA: 100,
      withheldISR: 100,
    });
    expect(sumDebits(lines)).toBe(2000);
    expect(sumCredits(lines)).toBe(2000);
  });

  it('isInventoryPurchase=false → DR Gastos Operativos en lugar de Inventario', () => {
    const lines = buildSupplierInvoiceJournalLines({
      subtotal: 500,
      tax: 60,
      withheldIVA: 0,
      withheldISR: 0,
      isInventoryPurchase: false,
    });
    expect(
      lines.find((l) => l.accountCode === ACCOUNTS.OPERATING_EXPENSES)?.debit,
    ).toBe(500);
    expect(
      lines.find((l) => l.accountCode === ACCOUNTS.INVENTORY),
    ).toBeUndefined();
  });

  it('subtotal 0 NO genera línea de DR Inventario/Gasto', () => {
    // Caso edge: factura solo de IVA (raro pero posible)
    const lines = buildSupplierInvoiceJournalLines({
      subtotal: 0,
      tax: 12,
      withheldIVA: 0,
      withheldISR: 0,
    });
    expect(lines.length).toBe(2); // IVA Crédito + AP
    expect(sumDebits(lines)).toBe(12);
    expect(sumCredits(lines)).toBe(12);
  });
});
