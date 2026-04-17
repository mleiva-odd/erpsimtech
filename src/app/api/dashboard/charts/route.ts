import { NextResponse } from 'next/server';
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

    let targetBranchId = isAdmin ? branchId : tenant.branchId;
    if (targetBranchId) {
      const branchResult = await requireBranchAccess(tenant, targetBranchId);
      if ('error' in branchResult) return branchResult.error;
      targetBranchId = branchResult.branchId as string;
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // Get last 7 days
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const salesWhere: any = {
      companyId: tenant.companyId,
      status: 'COMPLETED',
    };
    if (targetBranchId) salesWhere.branchId = targetBranchId;

    const [
      salesLast7Days,
      topProducts,
      salesByPaymentMethod,
      salesByBranch,
    ] = await Promise.all([
      // Sales per day for last 7 days
      prisma.sale.findMany({
        where: {
          ...salesWhere,
          createdAt: { gte: sevenDaysAgo },
        },
        select: { total: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Top 5 products by quantity sold
      prisma.saleItem.groupBy({
        by: ['productId'],
        where: {
          sale: salesWhere,
        },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
      // Sales by payment method
      prisma.payment.groupBy({
        by: ['method'],
        where: {
          sale: salesWhere,
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Sales by branch (if admin sees all)
      isAdmin && !targetBranchId ? prisma.sale.groupBy({
        by: ['branchId'],
        where: { companyId: tenant.companyId, status: 'COMPLETED' },
        _sum: { total: true },
        _count: { id: true },
      }) : Promise.resolve([]),
    ]);

    // Process daily sales into chart-friendly format
    const dailySales: Record<string, { date: string; total: number; count: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('es-GT', { weekday: 'short' });
      dailySales[key] = { date: dayName, total: 0, count: 0 };
    }
    salesLast7Days.forEach(sale => {
      const key = new Date(sale.createdAt).toISOString().split('T')[0];
      if (dailySales[key]) {
        dailySales[key].total += Number(sale.total);
        dailySales[key].count += 1;
      }
    });

    // Fetch product names for top products
    const productIds = topProducts.map(tp => tp.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const productMap = Object.fromEntries(products.map(p => [p.id, p.name]));

    // Fetch branch names for sales by branch
    let branchData: any[] = [];
    if (Array.isArray(salesByBranch) && salesByBranch.length > 0) {
      const branchIds = salesByBranch.map((b: any) => b.branchId);
      const branches = await prisma.branch.findMany({
        where: { id: { in: branchIds } },
        select: { id: true, name: true },
      });
      const branchMap = Object.fromEntries(branches.map(b => [b.id, b.name]));
      branchData = salesByBranch.map((b: any) => ({
        name: branchMap[b.branchId] || 'Desconocida',
        total: Number(b._sum.total),
        count: b._count.id,
      }));
    }

    return NextResponse.json({
      dailySales: Object.values(dailySales),
      topProducts: topProducts.map(tp => ({
        name: productMap[tp.productId] || 'Producto eliminado',
        quantity: tp._sum.quantity,
        revenue: Number(tp._sum.subtotal),
      })),
      paymentMethods: salesByPaymentMethod.map(pm => ({
        method: pm.method,
        total: Number(pm._sum.amount),
        count: pm._count.id,
      })),
      salesByBranch: branchData,
    });
  } catch (error) {
    console.error('Dashboard charts error:', error);
    return NextResponse.json({ error: 'Error cargando analytics' }, { status: 500 });
  }
}
