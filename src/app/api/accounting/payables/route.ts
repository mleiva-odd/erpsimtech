import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const supplierId = searchParams.get('supplierId');
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '25');

  const where: Record<string, unknown> = { companyId: tenant.companyId };
  if (status && ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'].includes(status)) where.status = status;
  if (supplierId) where.supplierId = supplierId;

  try {
    const [payables, total] = await Promise.all([
      prisma.supplierPayable.findMany({
        where,
        include: {
          supplier: { select: { name: true } },
          user: { select: { name: true } },
          purchase: { select: { id: true, reference: true } },
          payments: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.supplierPayable.count({ where }),
    ]);

    // Summary aggregates
    const summary = await prisma.supplierPayable.aggregate({
      where: { companyId: tenant.companyId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      _sum: { totalAmount: true, paidAmount: true },
    });

    return NextResponse.json({
      data: payables,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalPayable: Number(summary._sum.totalAmount || 0) - Number(summary._sum.paidAmount || 0),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission('treasury:manage');
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { supplierId, purchaseId, description, totalAmount, dueDate } = await req.json();

  if (!supplierId || !description || !totalAmount || totalAmount <= 0) {
    return NextResponse.json({ error: 'Proveedor, descripción y monto son obligatorios' }, { status: 400 });
  }

  try {
    const payable = await prisma.supplierPayable.create({
      data: {
        companyId: tenant.companyId,
        supplierId,
        purchaseId: purchaseId || null,
        userId: tenant.userId,
        description,
        totalAmount,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: { supplier: { select: { name: true } } },
    });

    return NextResponse.json(payable, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear cuenta por pagar' }, { status: 500 });
  }
}
