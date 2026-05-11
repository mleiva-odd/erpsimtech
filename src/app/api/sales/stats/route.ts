import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const branchId = searchParams.get('branchId');
  const channel = searchParams.get('channel');

  const isAdmin = tenant.role === 'SUPER_ADMIN' || tenant.permissions?.includes('settings:manage');
  const targetBranchId = (!isAdmin || !branchId || branchId === 'null')
    ? tenant.branchId
    : branchId;

  // Base where for COMPLETED sales
  const where: Prisma.SaleWhereInput = {
    companyId: tenant.companyId,
    status: 'COMPLETED',
  };

  if (targetBranchId) where.branchId = targetBranchId;
  if (channel && ['POS', 'REMOTE', 'WEB'].includes(channel)) {
    where.channel = channel as 'POS' | 'REMOTE' | 'WEB';
  }

  // Date range
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      (where.createdAt as Prisma.DateTimeFilter).lte = end;
    }
  }

  try {
    // Aggregate sales
    const salesAgg = await prisma.sale.aggregate({
      where,
      _sum: { total: true, discount: true },
      _count: true,
      _avg: { total: true },
    });

    // Returns in the same period
    const returnWhere: Prisma.SaleReturnWhereInput = {
      sale: where,
    };
    const returnsAgg = await prisma.saleReturn.aggregate({
      where: returnWhere,
      _sum: { amount: true },
      _count: true,
    });

    const totalSales = Number(salesAgg._sum.total || 0);
    const totalReturns = Number(returnsAgg._sum.amount || 0);
    const avgTicket = Number(salesAgg._avg.total || 0);
    const salesCount = salesAgg._count;
    const returnsCount = returnsAgg._count;

    return NextResponse.json({
      totalSales,
      totalReturns,
      netSales: totalSales - totalReturns,
      avgTicket,
      salesCount,
      returnsCount,
    });
  } catch (error) {
    console.error('Error in sales stats:', error);
    return NextResponse.json({ error: 'Error cargando estadísticas' }, { status: 500 });
  }
}
