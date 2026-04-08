import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';

export async function GET(req: Request) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const requestedBranchId = searchParams.get('branchId');
    const isAdmin = tenant.role === 'ADMIN' || tenant.role === 'SUPER_ADMIN';

    // Determinar la sucursal de destino: Admin usa URL, empleados usan su token
    const targetBranchId = (!isAdmin || !requestedBranchId || requestedBranchId === 'null') 
      ? tenant.branchId 
      : requestedBranchId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const salesWhere: any = {
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
      prisma.productStock.count({
        where: {
          product: { companyId: tenant.companyId, active: true },
          ...(targetBranchId && { branchId: targetBranchId }),
          quantity: { lte: 5 }, // Simple threshold; will use minStock comparison later
        },
      }),
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
