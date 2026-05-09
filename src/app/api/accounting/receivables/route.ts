import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '25');

  try {
    const where = {
      companyId: tenant.companyId,
      balance: { gt: 0 }
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          nit: true,
          creditLimit: true,
          balance: true,
          accountPayments: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              amount: true,
              method: true,
              status: true,
              createdAt: true
            }
          }
        },
        orderBy: { balance: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.customer.count({ where }),
    ]);

    const summary = await prisma.customer.aggregate({
      where,
      _sum: { balance: true }
    });

    return NextResponse.json({
      data: customers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totalReceivable: Number(summary._sum.balance || 0)
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error del servidor al obtener cuentas por cobrar' }, { status: 500 });
  }
}
