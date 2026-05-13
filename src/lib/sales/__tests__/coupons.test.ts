import { describe, it, expect } from 'vitest';
import { validateAndApplyCoupon, CouponError } from '../coupons';

function mkTx(coupon: unknown, prevRedemptions = 0) {
  return {
    coupon: {
      findFirst: async () => coupon,
    },
    couponRedemption: {
      count: async () => prevRedemptions,
    },
  };
}

const NOW = new Date('2026-05-12T12:00:00Z');

const baseCoupon = {
  id: 'cp1',
  type: 'FIXED_AMOUNT' as const,
  amount: 100,
  percentage: null,
  maxUses: null,
  usedCount: 0,
  perCustomerLimit: null,
  minPurchase: null,
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validUntil: new Date('2026-12-31T00:00:00Z'),
  active: true,
};

describe('validateAndApplyCoupon (Fase 20)', () => {
  it('FIXED_AMOUNT devuelve amount fijo', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await validateAndApplyCoupon(mkTx(baseCoupon) as any, {
      code: 'X',
      companyId: 'c',
      subtotal: 500,
      now: NOW,
    });
    expect(r.amount).toBe(100);
    expect(r.type).toBe('FIXED_AMOUNT');
  });

  it('PERCENTAGE_OFF: calcula sobre subtotal', async () => {
    const coupon = { ...baseCoupon, type: 'PERCENTAGE_OFF' as const, amount: null, percentage: 0.1 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await validateAndApplyCoupon(mkTx(coupon) as any, {
      code: 'X',
      companyId: 'c',
      subtotal: 500,
      now: NOW,
    });
    expect(r.amount).toBe(50);
  });

  it('rechaza si está inactivo', async () => {
    const coupon = { ...baseCoupon, active: false };
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateAndApplyCoupon(mkTx(coupon) as any, { code: 'X', companyId: 'c', subtotal: 100, now: NOW }),
    ).rejects.toBeInstanceOf(CouponError);
  });

  it('rechaza fuera de ventana', async () => {
    const coupon = {
      ...baseCoupon,
      validFrom: new Date('2027-01-01T00:00:00Z'),
      validUntil: new Date('2027-12-31T00:00:00Z'),
    };
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateAndApplyCoupon(mkTx(coupon) as any, { code: 'X', companyId: 'c', subtotal: 100, now: NOW }),
    ).rejects.toThrow(/vigencia/);
  });

  it('rechaza si maxUses agotado', async () => {
    const coupon = { ...baseCoupon, maxUses: 5, usedCount: 5 };
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateAndApplyCoupon(mkTx(coupon) as any, { code: 'X', companyId: 'c', subtotal: 100, now: NOW }),
    ).rejects.toThrow(/redenciones/);
  });

  it('rechaza si subtotal < minPurchase', async () => {
    const coupon = { ...baseCoupon, minPurchase: 1000 };
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateAndApplyCoupon(mkTx(coupon) as any, { code: 'X', companyId: 'c', subtotal: 500, now: NOW }),
    ).rejects.toThrow(/mínima/);
  });

  it('rechaza si customer alcanzó perCustomerLimit', async () => {
    const coupon = { ...baseCoupon, perCustomerLimit: 1 };
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateAndApplyCoupon(mkTx(coupon, 1) as any, {
        code: 'X',
        companyId: 'c',
        customerId: 'cust1',
        subtotal: 200,
        now: NOW,
      }),
    ).rejects.toThrow(/límite/);
  });

  it('FIXED_AMOUNT no excede subtotal', async () => {
    const coupon = { ...baseCoupon, amount: 500 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await validateAndApplyCoupon(mkTx(coupon) as any, {
      code: 'X',
      companyId: 'c',
      subtotal: 200,
      now: NOW,
    });
    expect(r.amount).toBe(200);
  });
});
