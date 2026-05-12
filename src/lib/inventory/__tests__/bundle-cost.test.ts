import { describe, it, expect } from 'vitest';
import { getCurrentCost } from '../cost';
import { makeMockTx } from './mock-tx';

const COMPANY = 'company-1';

describe('getCurrentCost (bundles)', () => {
  it('producto simple sin variante → devuelve product.cost', async () => {
    const tx = makeMockTx({
      products: [{ id: 'p1', companyId: COMPANY, cost: 50 }],
    });
    const cost = await getCurrentCost(tx as never, 'p1');
    expect(cost).toBe(50);
  });

  it('producto con variante → devuelve variant.cost', async () => {
    const tx = makeMockTx({
      products: [{ id: 'p1', companyId: COMPANY, cost: 50 }],
      variants: [{ id: 'v1', productId: 'p1', cost: 75 }],
    });
    const cost = await getCurrentCost(tx as never, 'p1', 'v1');
    expect(cost).toBe(75);
  });

  it('bundle simple → suma de costos de componentes', async () => {
    // Bundle: 2x componente A (cost=10) + 3x componente B (cost=20) = 80
    const tx = makeMockTx({
      products: [
        {
          id: 'bundle1',
          companyId: COMPANY,
          cost: 0,
          isBundle: true,
          bundleItems: [
            { componentId: 'a', variantId: null, quantity: 2 },
            { componentId: 'b', variantId: null, quantity: 3 },
          ],
        },
        { id: 'a', companyId: COMPANY, cost: 10 },
        { id: 'b', companyId: COMPANY, cost: 20 },
      ],
    });
    const cost = await getCurrentCost(tx as never, 'bundle1');
    expect(cost).toBe(2 * 10 + 3 * 20);
    expect(cost).toBe(80);
  });

  it('bundle de bundle (recursivo) → suma recursiva', async () => {
    // outer = 1x inner + 2x C
    // inner = 1x A + 1x B
    // A=5, B=10, C=20
    // inner cost = 5 + 10 = 15
    // outer cost = 15 + 2*20 = 55
    const tx = makeMockTx({
      products: [
        {
          id: 'outer',
          companyId: COMPANY,
          cost: 0,
          isBundle: true,
          bundleItems: [
            { componentId: 'inner', variantId: null, quantity: 1 },
            { componentId: 'C', variantId: null, quantity: 2 },
          ],
        },
        {
          id: 'inner',
          companyId: COMPANY,
          cost: 0,
          isBundle: true,
          bundleItems: [
            { componentId: 'A', variantId: null, quantity: 1 },
            { componentId: 'B', variantId: null, quantity: 1 },
          ],
        },
        { id: 'A', companyId: COMPANY, cost: 5 },
        { id: 'B', companyId: COMPANY, cost: 10 },
        { id: 'C', companyId: COMPANY, cost: 20 },
      ],
    });
    const cost = await getCurrentCost(tx as never, 'outer');
    expect(cost).toBe(55);
  });

  it('bundle con componente con variante → usa variant.cost', async () => {
    // bundle = 1x componente A pero variante v1 (cost=99) en lugar del cost
    // base del producto A (cost=10).
    const tx = makeMockTx({
      products: [
        {
          id: 'bundle1',
          companyId: COMPANY,
          cost: 0,
          isBundle: true,
          bundleItems: [
            { componentId: 'A', variantId: 'v1', quantity: 1 },
          ],
        },
        { id: 'A', companyId: COMPANY, cost: 10 },
      ],
      variants: [{ id: 'v1', productId: 'A', cost: 99 }],
    });
    const cost = await getCurrentCost(tx as never, 'bundle1');
    expect(cost).toBe(99);
  });
});
