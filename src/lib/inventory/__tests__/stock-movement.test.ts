import { describe, it, expect } from 'vitest';
import { recordStockMovement } from '../cost';
import { makeMockTx } from './mock-tx';

const COMPANY = 'company-1';
const USER = 'user-1';
const BRANCH = 'branch-1';

describe('recordStockMovement', () => {
  it('PURCHASE crea fila StockMovement, actualiza ProductStock y aplica WAC a Product.cost', async () => {
    const tx = makeMockTx({
      products: [{ id: 'p1', companyId: COMPANY, cost: 100 }],
      stocks: [{ productId: 'p1', branchId: BRANCH, quantity: 10, variantId: null }],
    });

    const mov = await recordStockMovement(tx as never, {
      companyId: COMPANY,
      productId: 'p1',
      branchId: BRANCH,
      type: 'PURCHASE',
      quantity: 10,
      unitCost: 200,
      referenceType: 'PURCHASE_ORDER',
      referenceId: 'po-1',
      userId: USER,
    });

    expect(mov).toBeDefined();
    expect(tx._state.movements.length).toBe(1);
    expect(tx._state.movements[0].type).toBe('PURCHASE');
    expect(tx._state.movements[0].quantity).toBe(10);
    expect(tx._state.movements[0].balanceAfter).toBe(20);
    expect(tx._state.movements[0].costAfter).toBe(150); // WAC: (10*100 + 10*200) / 20

    // Product.cost se actualizó al WAC
    expect(tx._state.products[0].cost).toBe(150);

    // ProductStock incrementó
    expect(tx._state.stocks[0].quantity).toBe(20);
  });

  it('SALE no recalcula WAC ni cambia Product.cost', async () => {
    const tx = makeMockTx({
      products: [{ id: 'p1', companyId: COMPANY, cost: 150 }],
      stocks: [{ productId: 'p1', branchId: BRANCH, quantity: 20, variantId: null }],
    });

    await recordStockMovement(tx as never, {
      companyId: COMPANY,
      productId: 'p1',
      branchId: BRANCH,
      type: 'SALE',
      quantity: -5,
      unitCost: 150,
      referenceType: 'SALE',
      referenceId: 'sale-1',
      userId: USER,
    });

    expect(tx._state.movements[0].costAfter).toBe(150);
    expect(tx._state.movements[0].balanceAfter).toBe(15);
    // Product.cost NO cambia en una venta
    expect(tx._state.products[0].cost).toBe(150);
    expect(tx._state.stocks[0].quantity).toBe(15);
  });

  it('ADJUSTMENT_IN actualiza WAC; ADJUSTMENT_OUT no', async () => {
    const tx = makeMockTx({
      products: [{ id: 'p1', companyId: COMPANY, cost: 100 }],
      stocks: [{ productId: 'p1', branchId: BRANCH, quantity: 10, variantId: null }],
    });

    await recordStockMovement(tx as never, {
      companyId: COMPANY,
      productId: 'p1',
      branchId: BRANCH,
      type: 'ADJUSTMENT_IN',
      quantity: 5,
      unitCost: 200,
      referenceType: 'INVENTORY_ADJUSTMENT',
      referenceId: 'adj-1',
      userId: USER,
    });

    // WAC: (10*100 + 5*200) / 15 = 2000/15 ≈ 133.3333
    expect(tx._state.products[0].cost).toBeCloseTo(133.3333, 3);

    await recordStockMovement(tx as never, {
      companyId: COMPANY,
      productId: 'p1',
      branchId: BRANCH,
      type: 'ADJUSTMENT_OUT',
      quantity: -3,
      unitCost: 50,
      referenceType: 'INVENTORY_ADJUSTMENT',
      referenceId: 'adj-2',
      userId: USER,
    });

    // No cambió Product.cost
    expect(tx._state.products[0].cost).toBeCloseTo(133.3333, 3);
    expect(tx._state.stocks[0].quantity).toBe(12);
  });

  it('crea ProductStock si no existe y la entrada es positiva', async () => {
    const tx = makeMockTx({
      products: [{ id: 'p1', companyId: COMPANY, cost: 0 }],
      // sin stocks iniciales
    });

    await recordStockMovement(tx as never, {
      companyId: COMPANY,
      productId: 'p1',
      branchId: BRANCH,
      type: 'PURCHASE',
      quantity: 7,
      unitCost: 50,
      referenceType: 'PURCHASE_ORDER',
      referenceId: 'po-2',
      userId: USER,
    });

    expect(tx._state.stocks.length).toBe(1);
    expect(tx._state.stocks[0].quantity).toBe(7);
    // stockBefore = 0, costBefore = 0 → asume costoIn como nuevo costo.
    expect(tx._state.products[0].cost).toBe(50);
  });

  it('quantity = 0 lanza error', async () => {
    const tx = makeMockTx({
      products: [{ id: 'p1', companyId: COMPANY, cost: 0 }],
    });
    await expect(
      recordStockMovement(tx as never, {
        companyId: COMPANY,
        productId: 'p1',
        branchId: BRANCH,
        type: 'ADJUSTMENT_IN',
        quantity: 0,
        unitCost: 100,
        referenceType: 'INVENTORY_ADJUSTMENT',
        referenceId: 'adj-x',
        userId: USER,
      }),
    ).rejects.toThrow(/quantity no puede ser 0/);
  });
});
