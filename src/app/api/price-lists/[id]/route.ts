import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { z } from 'zod';

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

async function getOwned(id: string, companyId: string) {
  const pl = (await (prisma as unknown as {
    priceList: { findUnique: (a: unknown) => Promise<unknown> };
  }).priceList.findUnique({
    where: { id },
  })) as { id: string; companyId: string } | null;
  if (!pl || pl.companyId !== companyId) return null;
  return pl;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  const pl = await getOwned(id, tenant.companyId);
  if (!pl) return NextResponse.json({ error: 'Lista no encontrada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await (prisma as unknown as {
    priceList: { update: (a: unknown) => Promise<unknown> };
  }).priceList.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;

  const pl = await getOwned(id, tenant.companyId);
  if (!pl) return NextResponse.json({ error: 'Lista no encontrada' }, { status: 404 });

  await (prisma as unknown as {
    priceList: { delete: (a: unknown) => Promise<unknown> };
  }).priceList.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
