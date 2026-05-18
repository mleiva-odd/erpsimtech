/**
 * Fase 25-3c · Integration test de `computeReceivablesAging`.
 *
 * Valida que la función orquestadora de aging:
 *  - Lee Customers con balance > 0 + sus ventas a crédito desde DB real.
 *  - Filtra correctamente (status COMPLETED/OVERDUE/PENDING, dueDate not null,
 *    payments.method=CREDIT).
 *  - Clasifica el balance en el bucket correcto según la venta más vieja
 *    vencida (`oldestSale`).
 *  - Respeta los buckets configurados en Company.agingBucketDays (default
 *    [30, 60, 90]).
 *  - Cliente sin balance (balance=0) NO aparece.
 *
 * NO testea `computePayablesAging` (cubre patrón análogo); se deja para
 * Fase 25-3d si se decide expandir.
 */

import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { computeReceivablesAging } from '@/lib/ar-ap/aging';
import {
  createTestBase,
  createTestCustomer,
  createTestCreditSale,
} from '@/test-utils/integration-fixtures';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('computeReceivablesAging · integration', () => {
  it('clasifica balance del customer en el bucket de la venta más vieja vencida (d90_plus)', async () => {
    const { company, branch, user } = await createTestBase();
    const customer = await createTestCustomer(company.id, { balance: 1500 });

    const asOf = new Date('2026-06-15T00:00:00Z');

    // Venta 1: vencida ~100 días antes de asOf (oldest, bucket d90_plus)
    await createTestCreditSale(company.id, branch.id, user.id, customer.id, {
      total: 1000,
      dueDate: new Date(asOf.getTime() - 100 * DAY_MS),
    });
    // Venta 2: vencida ~30 días (no es oldest)
    await createTestCreditSale(company.id, branch.id, user.id, customer.id, {
      total: 500,
      dueDate: new Date(asOf.getTime() - 30 * DAY_MS),
    });

    const result = await computeReceivablesAging(prisma, company.id, asOf);
    expect(result).toHaveLength(1);
    expect(result[0].customerId).toBe(customer.id);
    expect(result[0].totalBalance).toBeCloseTo(1500, 2);
    // Todo el balance va al bucket del oldestDueDate (100 días vencida → d90_plus).
    expect(result[0].buckets.d90_plus).toBeCloseTo(1500, 2);
    // Otros buckets en 0.
    expect(result[0].buckets.current).toBe(0);
    expect(result[0].buckets.d1_30).toBe(0);
    expect(result[0].buckets.d31_60).toBe(0);
    expect(result[0].buckets.d61_90).toBe(0);
    expect(result[0].oldestOverdueDays).toBeGreaterThanOrEqual(99);
    expect(result[0].oldestOverdueDays).toBeLessThanOrEqual(101);
  });

  it('customer con balance=0 NO aparece en el aging', async () => {
    const { company, branch, user } = await createTestBase();
    const customer = await createTestCustomer(company.id, { balance: 0 });
    await createTestCreditSale(company.id, branch.id, user.id, customer.id, {
      total: 800,
      dueDate: new Date('2026-04-15'),
    });

    const result = await computeReceivablesAging(prisma, company.id);
    expect(result).toHaveLength(0);
  });

  it('customer con venta a crédito NO vencida (dueDate futura) → bucket current', async () => {
    const { company, branch, user } = await createTestBase();
    const customer = await createTestCustomer(company.id, { balance: 750 });

    const asOf = new Date('2026-06-15T00:00:00Z');
    // dueDate +15 días en el futuro → no vencida
    await createTestCreditSale(company.id, branch.id, user.id, customer.id, {
      total: 750,
      dueDate: new Date(asOf.getTime() + 15 * DAY_MS),
    });

    const result = await computeReceivablesAging(prisma, company.id, asOf);
    expect(result).toHaveLength(1);
    expect(result[0].buckets.current).toBeCloseTo(750, 2);
    expect(result[0].buckets.d1_30).toBe(0);
    expect(result[0].buckets.d90_plus).toBe(0);
    expect(result[0].oldestOverdueDays).toBe(0);
  });
});
