import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;

  const note = await prisma.deliveryNote.findFirst({
    where: { id, companyId: tenant.companyId },
    include: {
      customer: { select: { name: true, phone: true, address: true } },
      user: { select: { name: true } },
      sale: { select: { id: true, total: true, invoiceNumber: true } },
      branch: { select: { name: true, address: true, phone: true } },
      company: { select: { name: true, logoUrl: true, phone: true } },
      items: { include: { product: { select: { name: true, sku: true } }, variant: { select: { name: true } } } },
    },
  });

  if (!note) return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });
  return NextResponse.json(note);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  const body = await req.json();
  const { status } = body;

  const validTransitions: Record<string, string[]> = {
    PENDING: ['DISPATCHED', 'CANCELLED'],
    DISPATCHED: ['DELIVERED', 'CANCELLED'],
  };

  const note = await prisma.deliveryNote.findFirst({
    where: { id, companyId: tenant.companyId },
    select: { status: true },
  });

  if (!note) return NextResponse.json({ error: 'Nota no encontrada' }, { status: 404 });

  const allowed = validTransitions[note.status];
  if (!allowed || !allowed.includes(status)) {
    return NextResponse.json({ error: `No se puede cambiar de ${note.status} a ${status}` }, { status: 400 });
  }

  const data: Record<string, unknown> = { status };
  if (status === 'DISPATCHED') data.dispatchedAt = new Date();
  if (status === 'DELIVERED') data.deliveredAt = new Date();

  const updated = await prisma.deliveryNote.update({ where: { id }, data });
  return NextResponse.json(updated);
}
