import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { z } from 'zod';

const CreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const data = await (prisma as unknown as {
    priceList: { findMany: (a: unknown) => Promise<unknown[]> };
  }).priceList.findMany({
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
    priceList: { create: (a: unknown) => Promise<unknown> };
  }).priceList.create({
    data: {
      companyId: tenant.companyId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isDefault: parsed.data.isDefault ?? false,
      active: parsed.data.active ?? true,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
