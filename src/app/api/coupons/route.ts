import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { z } from 'zod';

const CouponSchema = z.object({
  code: z.string().min(1),
  type: z.enum(['FIXED_AMOUNT', 'PERCENTAGE_OFF']),
  amount: z.number().nonnegative().optional().nullable(),
  percentage: z.number().min(0).max(1).optional().nullable(),
  maxUses: z.number().int().positive().optional().nullable(),
  perCustomerLimit: z.number().int().positive().optional().nullable(),
  minPurchase: z.number().nonnegative().optional().nullable(),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  active: z.boolean().optional(),
});

export async function GET() {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;
  const data = await (prisma as unknown as {
    coupon: { findMany: (a: unknown) => Promise<unknown[]> };
  }).coupon.findMany({
    where: { companyId: tenant.companyId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;
  const body = await req.json().catch(() => ({}));
  const parsed = CouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  if (d.type === 'FIXED_AMOUNT' && (!d.amount || d.amount <= 0)) {
    return NextResponse.json({ error: 'FIXED_AMOUNT requiere amount > 0.' }, { status: 400 });
  }
  if (d.type === 'PERCENTAGE_OFF' && (!d.percentage || d.percentage <= 0)) {
    return NextResponse.json({ error: 'PERCENTAGE_OFF requiere percentage > 0.' }, { status: 400 });
  }
  try {
    const created = await (prisma as unknown as {
      coupon: { create: (a: unknown) => Promise<unknown> };
    }).coupon.create({
      data: {
        companyId: tenant.companyId,
        code: d.code,
        type: d.type,
        amount: d.amount ?? null,
        percentage: d.percentage ?? null,
        maxUses: d.maxUses ?? null,
        perCustomerLimit: d.perCustomerLimit ?? null,
        minPurchase: d.minPurchase ?? null,
        validFrom: new Date(d.validFrom),
        validUntil: new Date(d.validUntil),
        active: d.active ?? true,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Código ya existe en esta empresa.' }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : 'Error al crear cupón';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
