import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireBranchAccess, requireTenant } from '@/lib/tenant';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  try {
    const [sale, settings] = await Promise.all([
      prisma.sale.findFirst({
        where: { id: resolvedParams.id, companyId: tenant.companyId },
        include: {
          items: {
            include: {
              product: { select: { name: true, sku: true } },
              variant: { select: { name: true, sku: true } },
            },
          },
          payments: true,
          returns: {
            include: {
              items: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          user: { select: { name: true } },
          customer: { select: { name: true, nit: true, address: true } },
          branch: { select: { name: true } },
        },
      }),
      prisma.companySettings.findUnique({ where: { companyId: tenant.companyId } }),
    ]);

    if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });

    const branchResult = await requireBranchAccess(tenant, sale.branchId);
    if ('error' in branchResult) return branchResult.error;

    return NextResponse.json({ sale, settings });
  } catch (error) {
    console.error('Error fetching sale by ID:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  try {
    const sale = await prisma.sale.findFirst({
      where: { id: resolvedParams.id, companyId: tenant.companyId },
      select: { id: true, status: true, branchId: true },
    });

    if (!sale) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    const branchResult = await requireBranchAccess(tenant, sale.branchId);
    if ('error' in branchResult) return branchResult.error;
    if (sale.status !== 'QUOTE') return NextResponse.json({ error: 'Solo puedes eliminar Cotizaciones.' }, { status: 400 });

    await prisma.sale.delete({ where: { id: sale.id } });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
