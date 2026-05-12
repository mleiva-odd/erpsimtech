import { describe, it, expect } from 'vitest';
import { recordStockMovement } from '../cost';
import { makeMockTx } from './mock-tx';

const COMPANY = 'company-1';
const USER = 'user-1';
const BRANCH = 'branch-1';

/**
 * Escenario: 3 compras + 2 ventas en orden cronológico.
 * Verifica que el saldo running, el WAC y la valuación final cuadren.
 */
describe('kardex / WAC integration scenario', () => {
  it('3 compras + 2 ventas → saldo y valuación correctos', async () => {
    const tx = makeMockTx({
      products: [{ id: 'p1', companyId: COMPANY, cost: 0 }],
    });

    // Compra 1: 10 @ Q100
    await recordStockMovement(tx as never, {
      companyId: COMPANY,
      productId: 'p1',
      branchId: BRANCH,
      type: 'PURCHASE',
      quantity: 10,
      unitCost: 100,
      referenceType: 'PURCHASE_ORDER',
      referenceId: 'po-1',
      userId: USER,
    });

    // Compra 2: 10 @ Q200
    await recordStockMovement(tx as never, {
      companyId: COMPANY,
      productId: 'p1',
      branchId: BRANCH,
      type: 'PURCHASE',
      quantity: 10,
      unitCost: 200,
      referenceType: 'PURCHASE_ORDER',
      referenceId: 'po-2',
      userId: USER,
    });

    // Venta 1: -5 unidades. unitCost = WAC vigente (150).
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

    // Compra 3: 5 @ Q300
    await recordStockMovement(tx as never, {
      companyId: COMPANY,
      productId: 'p1',
      branchId: BRANCH,
      type: 'PURCHASE',
      quantity: 5,
      unitCost: 300,
      referenceType: 'PURCHASE_ORDER',
      referenceId: 'po-3',
      userId: USER,
    });

    // Venta 2: -3 unidades. unitCost = WAC vigente.
    await recordStockMovement(tx as never, {
      companyId: COMPANY,
      productId: 'p1',
      branchId: BRANCH,
      type: 'SALE',
      quantity: -3,
      unitCost: 195,
      referenceType: 'SALE',
      referenceId: 'sale-2',
      userId: USER,
    });

    const moves = tx._state.movements;
    expect(moves.length).toBe(5);

    // Saldo running:
    //   start = 0
    //   +10 = 10
    //   +10 = 20
    //   -5  = 15
    //   +5  = 20
    //   -3  = 17
    expect(moves[0].balanceAfter).toBe(10);
    expect(moves[1].balanceAfter).toBe(20);
    expect(moves[2].balanceAfter).toBe(15);
    expect(moves[3].balanceAfter).toBe(20);
    expect(moves[4].balanceAfter).toBe(17);

    // WAC running:
    //   após compra 1: 100
    //   após compra 2: (10*100 + 10*200) / 20 = 150
    //   após venta 1: 150 (no cambia)
    //   após compra 3: (15*150 + 5*300) / 20 = (2250 + 1500) / 20 = 187.5
    //   após venta 2: 187.5 (no cambia)
    expect(moves[0].costAfter).toBe(100);
    expect(moves[1].costAfter).toBe(150);
    expect(moves[2].costAfter).toBe(150);
    expect(moves[3].costAfter).toBe(187.5);
    expect(moves[4].costAfter).toBe(187.5);

    // Stock físico final
    expect(tx._state.stocks[0].quantity).toBe(17);

    // Valuación final = stock * WAC
    const lastMov = moves[moves.length - 1];
    expect(lastMov.balanceAfter * lastMov.costAfter).toBe(17 * 187.5);
    expect(17 * 187.5).toBe(3187.5);

    // Product.cost queda en el último WAC
    expect(tx._state.products[0].cost).toBe(187.5);
  });

  it('Σ movimientos.quantity == stock físico final', async () => {
    const tx = makeMockTx({
      products: [{ id: 'p1', companyId: COMPANY, cost: 0 }],
    });

    const ops: Array<[number, number]> = [
      [10, 100],
      [5, 150],
      [-3, 0], // venta
      [2, 200],
      [-4, 0], // venta
      [-1, 0], // ajuste OUT
      [7, 80],
    ];

    for (let i = 0; i < ops.length; i++) {
      const [qty, cost] = ops[i];
      const type: 'PURCHASE' | 'SALE' | 'ADJUSTMENT_OUT' =
        qty > 0 ? 'PURCHASE' : qty === -1 ? 'ADJUSTMENT_OUT' : 'SALE';
      await recordStockMovement(tx as never, {
        companyId: COMPANY,
        productId: 'p1',
        branchId: BRANCH,
        type,
        quantity: qty,
        unitCost: cost > 0 ? cost : 100,
        referenceType: 'TEST',
        referenceId: `op-${i}`,
        userId: USER,
      });
    }

    const sumQty = tx._state.movements.reduce(
      (acc: number, m: { quantity: number }) => acc + m.quantity,
      0,
    );
    const stockFinal = tx._state.stocks[0].quantity;
    expect(sumQty).toBe(stockFinal);
  });
});
