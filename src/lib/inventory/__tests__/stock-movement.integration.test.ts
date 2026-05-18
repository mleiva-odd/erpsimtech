/**
 * Fase 25-3a · Integration test de `recordStockMovement`.
 *
 * Este es el PRIMER integration test del proyecto. Valida que:
 *  - El setup docker-compose.test.yml + vitest.config.integration.ts funciona.
 *  - Las migraciones se aplican OK en la DB de test.
 *  - Los fixtures crean entidades correctas.
 *  - El truncate entre tests aisla data correctamente.
 *  - Una función transaccional real (`recordStockMovement`) actualiza
 *    ProductStock + crea StockMovement + recalcula WAC en Product.cost
 *    todo dentro de una transacción Prisma real.
 *
 * Si este test pasa verde, el patrón está validado y se puede expandir a
 * payroll/accounting, ar-ap/aging, fel/certify, etc.
 */

import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { recordStockMovement } from '@/lib/inventory';
import {
  createTestBase,
  createTestProduct,
  createTestProductStock,
} from '@/test-utils/integration-fixtures';

describe('recordStockMovement · integration', () => {
  it('compra (PURCHASE) crea StockMovement, suma ProductStock y actualiza Product.cost (WAC)', async () => {
    const { company, branch, user, category } = await createTestBase();
    const product = await createTestProduct(company.id, category.id, {
      cost: 50, // costo previo
    });
    // Stock inicial: 10 unidades a Q50.
    await createTestProductStock(product.id, branch.id, 10);

    // Compra de 10 unidades a Q70 → WAC = (10*50 + 10*70) / 20 = 60.
    await prisma.$transaction(async (tx) => {
      await recordStockMovement(tx, {
        companyId: company.id,
        productId: product.id,
        branchId: branch.id,
        type: 'PURCHASE',
        quantity: 10,
        unitCost: 70,
        referenceType: 'TEST_PURCHASE',
        referenceId: 'test-ref-1',
        userId: user.id,
      });
    });

    // 1) ProductStock pasó de 10 a 20.
    const stock = await prisma.productStock.findFirst({
      where: { productId: product.id, branchId: branch.id },
      select: { quantity: true },
    });
    expect(Number(stock?.quantity)).toBe(20);

    // 2) Product.cost actualizado al WAC (60).
    const updatedProduct = await prisma.product.findUnique({
      where: { id: product.id },
      select: { cost: true },
    });
    expect(Number(updatedProduct?.cost)).toBeCloseTo(60, 2);

    // 3) StockMovement registrado con balanceAfter = 20.
    const movements = await prisma.stockMovement.findMany({
      where: { productId: product.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('PURCHASE');
    expect(Number(movements[0].quantity)).toBe(10);
    expect(Number(movements[0].balanceAfter)).toBe(20);
  });

  it('venta (SALE) resta ProductStock pero NO modifica Product.cost', async () => {
    const { company, branch, user, category } = await createTestBase();
    const product = await createTestProduct(company.id, category.id, {
      cost: 50,
    });
    await createTestProductStock(product.id, branch.id, 30);

    await prisma.$transaction(async (tx) => {
      await recordStockMovement(tx, {
        companyId: company.id,
        productId: product.id,
        branchId: branch.id,
        type: 'SALE',
        quantity: -5,
        unitCost: 50,
        referenceType: 'TEST_SALE',
        referenceId: 'test-ref-2',
        userId: user.id,
      });
    });

    const stock = await prisma.productStock.findFirst({
      where: { productId: product.id, branchId: branch.id },
      select: { quantity: true },
    });
    expect(Number(stock?.quantity)).toBe(25);

    // Product.cost intacto en 50 (las salidas NO cambian WAC).
    const updatedProduct = await prisma.product.findUnique({
      where: { id: product.id },
      select: { cost: true },
    });
    expect(Number(updatedProduct?.cost)).toBeCloseTo(50, 2);
  });

  it('AISLAMIENTO entre tests: cada test arranca con 0 datos (truncate funciona)', async () => {
    // Este test corre después de los anteriores. Si el truncate falla,
    // habría productos/stocks/movements remanentes.
    const products = await prisma.product.count();
    const stocks = await prisma.productStock.count();
    const movements = await prisma.stockMovement.count();
    expect(products).toBe(0);
    expect(stocks).toBe(0);
    expect(movements).toBe(0);
  });
});
