import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireBranchAccess, requireRole } from '@/lib/tenant';

export async function GET(req: Request) {
  const result = await requireRole('SUPERVISOR');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const requestedBranchId = searchParams.get('branchId');
    const isAdmin = tenant.role === 'ADMIN' || tenant.role === 'SUPER_ADMIN';
    const branchId = requestedBranchId && requestedBranchId !== 'all' && requestedBranchId !== 'null'
      ? requestedBranchId
      : null;

    // Determinar la sucursal de destino: Admin usa URL, empleados usan su token
    let targetBranchId = isAdmin ? branchId : tenant.branchId;

    if (targetBranchId) {
      const branchResult = await requireBranchAccess(tenant, targetBranchId);
      if ('error' in branchResult) return branchResult.error;
      targetBranchId = branchResult.branchId as string;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const salesWhere: Prisma.SaleWhereInput = {
      companyId: tenant.companyId,
      status: 'COMPLETED',
    };

    if (targetBranchId) {
      salesWhere.branchId = targetBranchId;
    }

    const [salesToday, totalProducts, lowStockProducts, recentSales] = await Promise.all([
      // Today's sales total
      prisma.sale.aggregate({
        where: {
          ...salesWhere,
          createdAt: { gte: today },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
      // Active products for this company
      prisma.product.count({
        where: { companyId: tenant.companyId, active: true },
      }),
      // Products with low stock (in user's branch or across all branches)
      prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int as count
        FROM "ProductStock" ps
        JOIN "Product" p ON ps."productId" = p.id
        WHERE p."companyId" = ${tenant.companyId}
          AND p.active = true
          AND ps.quantity <= ps."minStock"
          ${targetBranchId ? prisma.$queryRaw`AND ps."branchId" = ${targetBranchId}` : prisma.$queryRaw``}
      `.then(res => Number(res[0]?.count || 0)),
      // Recent 5 sales
      prisma.sale.findMany({
        where: salesWhere,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true } },
          branch: { select: { name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      revenueToday: Number(salesToday._sum.total || 0),
      salesCountToday: salesToday._count.id,
      totalProducts,
      lowStockProducts,
      recentSales,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Error cargando dashboard' }, { status: 500 });
  }
}
