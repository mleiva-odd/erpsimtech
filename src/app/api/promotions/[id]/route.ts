import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { z } from 'zod';

const PatchSchema = z.object({
  name: z.string().optional(),
  minPurchase: z.number().nonnegative().optional().nullable(),
  applicableProductIds: z.array(z.string().uuid()).optional(),
  quantityRequired: z.number().int().positive().optional().nullable(),
  quantityFree: z.number().int().positive().optional().nullable(),
  discountRate: z.number().min(0).max(1).optional().nullable(),
  fixedPrice: z.number().positive().optional().nullable(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  active: z.boolean().optional(),
});

async function getOwned(id: string, companyId: string) {
  const p = (await (prisma as unknown as {
    promotion: { findUnique: (a: unknown) => Promise<unknown> };
  }).promotion.findUnique({ where: { id } })) as { id: string; companyId: string } | null;
  if (!p || p.companyId !== companyId) return null;
  return p;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;
  const { id } = await params;
  const p = await getOwned(id, tenant.companyId);
  if (!p) return NextResponse.json({ error: 'Promo no encontrada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.startsAt) data.startsAt = new Date(parsed.data.startsAt);
  if (parsed.data.endsAt) data.endsAt = new Date(parsed.data.endsAt);

  const updated = await (prisma as unknown as {
    promotion: { update: (a: unknown) => Promise<unknown> };
  }).promotion.update({
    where: { id },
    data,
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
  const p = await getOwned(id, tenant.companyId);
  if (!p) return NextResponse.json({ error: 'Promo no encontrada' }, { status: 404 });

  await (prisma as unknown as {
    promotion: { delete: (a: unknown) => Promise<unknown> };
  }).promotion.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
