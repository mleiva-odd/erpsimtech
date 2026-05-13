import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { z } from 'zod';

const CreateItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  price: z.number().nonnegative(),
});

async function ownsList(id: string, companyId: string): Promise<boolean> {
  const pl = (await (prisma as unknown as {
    priceList: { findUnique: (a: unknown) => Promise<unknown> };
  }).priceList.findUnique({ where: { id } })) as { companyId: string } | null;
  return pl?.companyId === companyId;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;
  if (!(await ownsList(id, tenant.companyId))) {
    return NextResponse.json({ error: 'Lista no encontrada' }, { status: 404 });
  }
  const items = await (prisma as unknown as {
    priceListItem: { findMany: (a: unknown) => Promise<unknown[]> };
  }).priceListItem.findMany({
    where: { priceListId: id },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  });
  return NextResponse.json({ data: items });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;
  if (!(await ownsList(id, tenant.companyId))) {
    return NextResponse.json({ error: 'Lista no encontrada' }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const created = await (prisma as unknown as {
    priceListItem: { create: (a: unknown) => Promise<unknown> };
  }).priceListItem.create({
    data: {
      priceListId: id,
      productId: parsed.data.productId,
      variantId: parsed.data.variantId ?? null,
      price: parsed.data.price,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
