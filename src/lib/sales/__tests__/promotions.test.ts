import { describe, it, expect } from 'vitest';
import { applyPromotions, type PromotionLike } from '../promotions';

const NOW = new Date('2026-05-12T12:00:00Z');

function basePromo(over: Partial<PromotionLike>): PromotionLike {
  return {
    id: 'p1',
    type: 'PERCENTAGE_OFF',
    minPurchase: null,
    applicableProductIds: [],
    quantityRequired: null,
    quantityFree: null,
    discountRate: null,
    fixedPrice: null,
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2026-12-31T00:00:00Z'),
    active: true,
    ...over,
  };
}

describe('applyPromotions · PERCENTAGE_OFF', () => {
  it('aplica 10% sobre todas las líneas si no hay applicableProductIds', () => {
    const promo = basePromo({ type: 'PERCENTAGE_OFF', discountRate: 0.1 });
    const res = applyPromotions(
      [
        { productId: 'a', unitPrice: 100, quantity: 1, lineDiscount: 0 },
        { productId: 'b', unitPrice: 50, quantity: 2, lineDiscount: 0 },
      ],
      [promo],
      { now: NOW },
    );
    expect(res.items[0].lineDiscount).toBeCloseTo(10);
    expect(res.items[1].lineDiscount).toBeCloseTo(10);
    expect(res.totalPromoDiscount).toBeCloseTo(20);
  });

  it('respeta applicableProductIds', () => {
    const promo = basePromo({ type: 'PERCENTAGE_OFF', discountRate: 0.2, applicableProductIds: ['a'] });
    const res = applyPromotions(
      [
        { productId: 'a', unitPrice: 100, quantity: 1, lineDiscount: 0 },
        { productId: 'b', unitPrice: 50, quantity: 1, lineDiscount: 0 },
      ],
      [promo],
      { now: NOW },
    );
    expect(res.items[0].lineDiscount).toBeCloseTo(20);
    expect(res.items[1].lineDiscount).toBeCloseTo(0);
  });

  it('respeta minPurchase', () => {
    const promo = basePromo({ type: 'PERCENTAGE_OFF', discountRate: 0.1, minPurchase: 200 });
    const res = applyPromotions(
      [{ productId: 'a', unitPrice: 100, quantity: 1, lineDiscount: 0 }],
      [promo],
      { now: NOW },
    );
    expect(res.totalPromoDiscount).toBe(0);
  });
});

describe('applyPromotions · BUY_N_GET_M (2x1)', () => {
  it('compra 2, lleva 1 gratis → descuento = 1 unidad', () => {
    const promo = basePromo({
      type: 'BUY_N_GET_M',
      quantityRequired: 2,
      quantityFree: 1,
      applicableProductIds: ['a'],
    });
    const res = applyPromotions(
      [{ productId: 'a', unitPrice: 100, quantity: 3, lineDiscount: 0 }],
      [promo],
      { now: NOW },
    );
    expect(res.items[0].lineDiscount).toBeCloseTo(100); // 1 gratis * 100
  });

  it('compra 6, 2x1 → 2 gratis', () => {
    const promo = basePromo({
      type: 'BUY_N_GET_M',
      quantityRequired: 2,
      quantityFree: 1,
    });
    const res = applyPromotions(
      [{ productId: 'a', unitPrice: 50, quantity: 6, lineDiscount: 0 }],
      [promo],
      { now: NOW },
    );
    expect(res.items[0].lineDiscount).toBeCloseTo(100); // 2 gratis * 50
  });

  it('compra 2 con N=3 → 0 descuento (no completa el grupo)', () => {
    const promo = basePromo({
      type: 'BUY_N_GET_M',
      quantityRequired: 3,
      quantityFree: 1,
    });
    const res = applyPromotions(
      [{ productId: 'a', unitPrice: 100, quantity: 2, lineDiscount: 0 }],
      [promo],
      { now: NOW },
    );
    expect(res.items[0].lineDiscount).toBe(0);
  });
});

describe('applyPromotions · FIXED_PRICE', () => {
  it('baja unitPrice efectivo a fixedPrice si es menor', () => {
    const promo = basePromo({ type: 'FIXED_PRICE', fixedPrice: 80, applicableProductIds: ['a'] });
    const res = applyPromotions(
      [{ productId: 'a', unitPrice: 100, quantity: 2, lineDiscount: 0 }],
      [promo],
      { now: NOW },
    );
    // 2 unidades * (100 - 80) = 40
    expect(res.items[0].lineDiscount).toBeCloseTo(40);
  });

  it('no aplica si fixedPrice >= unitPrice', () => {
    const promo = basePromo({ type: 'FIXED_PRICE', fixedPrice: 200, applicableProductIds: ['a'] });
    const res = applyPromotions(
      [{ productId: 'a', unitPrice: 100, quantity: 1, lineDiscount: 0 }],
      [promo],
      { now: NOW },
    );
    expect(res.items[0].lineDiscount).toBe(0);
  });
});

describe('applyPromotions · ventana temporal', () => {
  it('no aplica si la promo no está activa', () => {
    const promo = basePromo({ type: 'PERCENTAGE_OFF', discountRate: 0.5, active: false });
    const res = applyPromotions(
      [{ productId: 'a', unitPrice: 100, quantity: 1, lineDiscount: 0 }],
      [promo],
      { now: NOW },
    );
    expect(res.totalPromoDiscount).toBe(0);
  });

  it('no aplica fuera de la ventana temporal', () => {
    const promo = basePromo({
      type: 'PERCENTAGE_OFF',
      discountRate: 0.5,
      startsAt: new Date('2027-01-01T00:00:00Z'),
      endsAt: new Date('2027-12-31T00:00:00Z'),
    });
    const res = applyPromotions(
      [{ productId: 'a', unitPrice: 100, quantity: 1, lineDiscount: 0 }],
      [promo],
      { now: NOW },
    );
    expect(res.totalPromoDiscount).toBe(0);
  });
});
