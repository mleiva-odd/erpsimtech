import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/tenant';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  try {
    const payroll = await prisma.payroll.findFirst({
      where: { id, companyId: tenant.companyId },
      include: {
        items: {
          include: { employee: true },
          orderBy: { employee: { firstName: 'asc' } }
        }
      }
    });

    if (!payroll) return NextResponse.json({ error: 'Planilla no encontrada' }, { status: 404 });

    return NextResponse.json(payroll);
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePermission('payroll:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { id } = await params;
  try {
    const { status } = await req.json();

    const payroll = await prisma.payroll.findFirst({
      where: { id, companyId: tenant.companyId }
    });

    if (!payroll) return NextResponse.json({ error: 'Planilla no encontrada' }, { status: 404 });

    const updated = await prisma.payroll.update({
      where: { id },
      data: { status }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar planilla' }, { status: 500 });
  }
}
