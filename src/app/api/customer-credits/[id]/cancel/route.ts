import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Fase 17 · Cancelar un CustomerCredit (set status=CANCELLED).
 * Solo posible si está en ACTIVE o PARTIALLY_APPLIED — los FULLY_APPLIED
 * ya consumieron su balance y no tiene sentido cancelarlos.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  try {
    const credit = (await (prisma as any).customerCredit.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true },
    })) as { id: string; companyId: string; status: string } | null;

    if (!credit || credit.companyId !== tenant.companyId) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }

    if (credit.status === 'CANCELLED' || credit.status === 'FULLY_APPLIED') {
      return NextResponse.json(
        { error: `No se puede cancelar un crédito ${credit.status}` },
        { status: 409 },
      );
    }

    const updated = await (prisma as any).customerCredit.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[customer-credits/cancel] error:', err);
    return NextResponse.json({ error: 'Error al cancelar' }, { status: 500 });
  }
}
