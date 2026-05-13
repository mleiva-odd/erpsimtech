import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { validateAndApplyCoupon, CouponError } from '@/lib/sales';
import { z } from 'zod';

const Body = z.object({
  subtotal: z.number().nonnegative(),
  customerId: z.string().uuid().optional().nullable(),
});

/**
 * POST /api/coupons/:code/redeem
 *
 * Endpoint de validación (NO redime). Devuelve el monto de descuento que
 * generaría el cupón sobre el subtotal dado, sin tocar `usedCount`. Útil
 * para la UI antes de submitear la venta. La redención real ocurre en
 * `POST /api/sales` cuando se pasa el `couponCode` en el body.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { code } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const res = await validateAndApplyCoupon(prisma, {
      code,
      companyId: tenant.companyId,
      customerId: parsed.data.customerId ?? null,
      subtotal: parsed.data.subtotal,
    });
    return NextResponse.json({ valid: true, ...res });
  } catch (err) {
    if (err instanceof CouponError) {
      return NextResponse.json({ valid: false, error: err.message, code: err.code }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Error al validar cupón';
    return NextResponse.json({ valid: false, error: message }, { status: 500 });
  }
}
