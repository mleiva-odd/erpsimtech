import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { z } from 'zod';

const CreateSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().uuid().optional().nullable(),
  basis: z.enum(['MARGIN', 'SUBTOTAL']).default('MARGIN'),
  rate: z.number().min(0).max(1),
  active: z.boolean().optional(),
});

export async function GET() {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;
  const data = await (prisma as unknown as {
    commissionRule: { findMany: (a: unknown) => Promise<unknown[]> };
  }).commissionRule.findMany({
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
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const created = await (prisma as unknown as {
    commissionRule: { create: (a: unknown) => Promise<unknown> };
  }).commissionRule.create({
    data: {
      companyId: tenant.companyId,
      name: parsed.data.name,
      categoryId: parsed.data.categoryId ?? null,
      basis: parsed.data.basis,
      rate: parsed.data.rate,
      active: parsed.data.active ?? true,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
