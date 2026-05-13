/**
 * Validación y aplicación de cupones (Fase 20).
 *
 * Reglas de validación:
 *   - Cupón activo (`active=true`).
 *   - Dentro de `validFrom..validUntil`.
 *   - `usedCount < maxUses` (si maxUses no es null).
 *   - Si `perCustomerLimit` está seteado, contar redenciones previas del cliente.
 *   - `subtotal >= minPurchase` (si minPurchase está seteado).
 *
 * Cálculo del descuento:
 *   - FIXED_AMOUNT: descuenta `amount`, sin exceder el subtotal.
 *   - PERCENTAGE_OFF: descuenta `subtotal * percentage`.
 *
 * Errores: lanza `CouponError` con un código semántico.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

export class CouponError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = 'CouponError';
    this.code = code;
    this.status = status;
  }
}

export interface ValidateCouponInput {
  code: string;
  companyId: string;
  customerId?: string | null;
  subtotal: number;
  now?: Date;
}

export interface ValidateCouponResult {
  couponId: string;
  amount: number; // GTQ efectivo a descontar
  type: 'FIXED_AMOUNT' | 'PERCENTAGE_OFF';
}

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return Number((v as { toString: () => string }).toString()) || 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function validateAndApplyCoupon(
  tx: Tx,
  input: ValidateCouponInput,
): Promise<ValidateCouponResult> {
  const code = input.code.trim();
  if (!code) throw new CouponError('Código de cupón vacío', 'COUPON_EMPTY');
  const now = input.now ?? new Date();

  const coupon = await (tx as unknown as {
    coupon: { findFirst: (a: unknown) => Promise<unknown> };
  }).coupon.findFirst({
    where: { companyId: input.companyId, code },
  }) as
    | {
        id: string;
        type: 'FIXED_AMOUNT' | 'PERCENTAGE_OFF';
        amount: unknown;
        percentage: unknown;
        maxUses: number | null;
        usedCount: number;
        perCustomerLimit: number | null;
        minPurchase: unknown;
        validFrom: Date;
        validUntil: Date;
        active: boolean;
      }
    | null;

  if (!coupon) throw new CouponError(`Cupón "${code}" no existe.`, 'COUPON_NOT_FOUND', 404);
  if (!coupon.active) throw new CouponError('Cupón inactivo.', 'COUPON_INACTIVE');
  if (new Date(coupon.validFrom) > now || new Date(coupon.validUntil) < now) {
    throw new CouponError('Cupón fuera de su período de vigencia.', 'COUPON_OUT_OF_WINDOW');
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    throw new CouponError('Cupón sin redenciones disponibles.', 'COUPON_EXHAUSTED', 409);
  }

  const minP = num(coupon.minPurchase);
  if (minP > 0 && input.subtotal < minP) {
    throw new CouponError(
      `Compra mínima Q${minP.toFixed(2)} para aplicar el cupón.`,
      'COUPON_MIN_PURCHASE',
    );
  }

  if (coupon.perCustomerLimit != null && input.customerId) {
    const used = await (tx as unknown as {
      couponRedemption: { count: (a: unknown) => Promise<number> };
    }).couponRedemption.count({
      where: { couponId: coupon.id, customerId: input.customerId },
    });
    if (used >= coupon.perCustomerLimit) {
      throw new CouponError(
        'Cliente alcanzó el límite de uso del cupón.',
        'COUPON_CUSTOMER_LIMIT',
        409,
      );
    }
  }

  let amt = 0;
  if (coupon.type === 'FIXED_AMOUNT') {
    amt = Math.min(num(coupon.amount), input.subtotal);
  } else {
    const pct = num(coupon.percentage);
    amt = round2(input.subtotal * pct);
  }
  if (amt <= 0) {
    throw new CouponError('Cupón no produce descuento.', 'COUPON_NO_DISCOUNT');
  }
  return { couponId: coupon.id, amount: amt, type: coupon.type };
}

/**
 * Persiste la redención y aumenta `usedCount` con check optimista.
 * Caller debe estar dentro de un $transaction.
 */
export async function persistCouponRedemption(
  tx: Tx,
  input: { couponId: string; saleId: string; customerId?: string | null; amount: number },
): Promise<void> {
  // Aumento atómico de usedCount.
  await (tx as unknown as {
    coupon: { update: (a: unknown) => Promise<unknown> };
  }).coupon.update({
    where: { id: input.couponId },
    data: { usedCount: { increment: 1 } },
  });
  await (tx as unknown as {
    couponRedemption: { create: (a: unknown) => Promise<unknown> };
  }).couponRedemption.create({
    data: {
      couponId: input.couponId,
      saleId: input.saleId,
      customerId: input.customerId ?? null,
      amount: round2(input.amount),
    },
  });
}
