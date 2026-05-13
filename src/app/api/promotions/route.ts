import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { z } from 'zod';

const PromotionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['BUY_N_GET_M', 'PERCENTAGE_OFF', 'FIXED_PRICE']),
  minPurchase: z.number().nonnegative().optional().nullable(),
  applicableProductIds: z.array(z.string().uuid()).optional(),
  quantityRequired: z.number().int().positive().optional().nullable(),
  quantityFree: z.number().int().positive().optional().nullable(),
  discountRate: z.number().min(0).max(1).optional().nullable(),
  fixedPrice: z.number().positive().optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  active: z.boolean().optional(),
});

export async function GET() {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;
  const data = await (prisma as unknown as {
    promotion: { findMany: (a: unknown) => Promise<unknown[]> };
  }).promotion.findMany({
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
  const parsed = PromotionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  // Validar consistencia según tipo.
  const d = parsed.data;
  if (d.type === 'BUY_N_GET_M' && (!d.quantityRequired || !d.quantityFree)) {
    return NextResponse.json({ error: 'BUY_N_GET_M requiere quantityRequired y quantityFree.' }, { status: 400 });
  }
  if (d.type === 'PERCENTAGE_OFF' && (d.discountRate == null || d.discountRate <= 0)) {
    return NextResponse.json({ error: 'PERCENTAGE_OFF requiere discountRate > 0.' }, { status: 400 });
  }
  if (d.type === 'FIXED_PRICE' && (d.fixedPrice == null || d.fixedPrice <= 0)) {
    return NextResponse.json({ error: 'FIXED_PRICE requiere fixedPrice > 0.' }, { status: 400 });
  }

  const created = await (prisma as unknown as {
    promotion: { create: (a: unknown) => Promise<unknown> };
  }).promotion.create({
    data: {
      companyId: tenant.companyId,
      name: d.name,
      type: d.type,
      minPurchase: d.minPurchase ?? null,
      applicableProductIds: d.applicableProductIds ?? [],
      quantityRequired: d.quantityRequired ?? null,
      quantityFree: d.quantityFree ?? null,
      discountRate: d.discountRate ?? null,
      fixedPrice: d.fixedPrice ?? null,
      startsAt: new Date(d.startsAt),
      endsAt: new Date(d.endsAt),
      active: d.active ?? true,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
