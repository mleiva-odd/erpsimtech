import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireBranchAccess, requirePermission } from '@/lib/tenant';
import { handleApiError } from '@/lib/api-error';

/**
 * Ventas por Usuario/Vendedor — útil para comisiones y ranking interno.
 *
 * Devuelve cantidad de ventas, monto total, ticket promedio y
 * costo total para calcular margen por vendedor.
 */
export async function GET(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const requestedBranchId = searchParams.get('branchId');
    const branchId =
      requestedBranchId && requestedBranchId !== 'all' && requestedBranchId !== 'null'
        ? requestedBranchId
        : null;

    const startDate = from
      ? new Date(from)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = to ? new Date(to) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const saleWhere: Prisma.SaleWhereInput = {
      companyId: tenant.companyId,
      status: 'COMPLETED',
      createdAt: { gte: startDate, lte: endDate },
    };

    if (branchId) {
      const branchResult = await requireBranchAccess(tenant, branchId);
      if ('error' in branchResult) return branchResult.error;
      saleWhere.branchId = branchId;
    } else if (
      tenant.role !== 'SUPER_ADMIN' &&
      !tenant.permissions?.includes('settings:manage') &&
      tenant.branchId
    ) {
      saleWhere.branchId = tenant.branchId;
    }

    const grouped = await prisma.sale.groupBy({
      by: ['userId'],
      where: saleWhere,
      _sum: { total: true },
      _count: { _all: true },
      _avg: { total: true },
      orderBy: { _sum: { total: 'desc' } },
    });

    const userIds = grouped.map((g) => g.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, companyId: tenant.companyId },
      select: { id: true, name: true, email: true, role: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Calcular costo total por usuario para margen
    const costPerUser = new Map<string, number>();
    if (userIds.length > 0) {
      const items = await prisma.saleItem.findMany({
        where: { sale: saleWhere },
        select: {
          quantity: true,
          unitCost: true,
          sale: { select: { userId: true } },
        },
      });
      for (const item of items) {
        const uid = item.sale.userId;
        const cost = Number(item.unitCost ?? 0) * item.quantity;
        costPerUser.set(uid, (costPerUser.get(uid) || 0) + cost);
      }
    }

    const ranking = grouped.map((row) => {
      const totalRevenue = Number(row._sum.total ?? 0);
      const totalCost = costPerUser.get(row.userId) || 0;
      return {
        userId: row.userId,
        user: userMap.get(row.userId) ?? null,
        saleCount: row._count._all,
        totalAmount: totalRevenue,
        averageTicket: Number(row._avg.total ?? 0),
        totalCost,
        profit: totalRevenue - totalCost,
        marginPct: totalRevenue > 0 ? (totalRevenue - totalCost) / totalRevenue : 0,
      };
    });

    return NextResponse.json({
      periodo: { desde: startDate, hasta: endDate },
      ranking,
    });
  } catch (error) {
    return handleApiError(error, '/api/reports/sales/by-user GET');
  }
}
