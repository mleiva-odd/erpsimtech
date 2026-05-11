import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireBranchAccess, requirePermission } from '@/lib/tenant';
import { handleApiError } from '@/lib/api-error';

/**
 * Top Customers — ranking de clientes por monto facturado.
 * Útil para identificar cuentas estratégicas y patrones de fidelidad.
 *
 * Query params:
 * - from, to: rango de fechas (default: últimos 90 días)
 * - branchId: filtrar por sucursal (default: respeta tenant.branchId si aplica)
 * - limit: cantidad máxima a devolver (default 20)
 */
export async function GET(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const requestedBranchId = searchParams.get('branchId');
    const branchId =
      requestedBranchId && requestedBranchId !== 'all' && requestedBranchId !== 'null'
        ? requestedBranchId
        : null;

    const startDate = from
      ? new Date(from)
      : new Date(new Date().setDate(new Date().getDate() - 90));
    const endDate = to ? new Date(to) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const saleWhere: Prisma.SaleWhereInput = {
      companyId: tenant.companyId,
      status: 'COMPLETED',
      createdAt: { gte: startDate, lte: endDate },
      customerId: { not: null },
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
      by: ['customerId'],
      where: saleWhere,
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    });

    const customerIds = grouped
      .map((g) => g.customerId)
      .filter((id): id is string => Boolean(id));

    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds }, companyId: tenant.companyId },
      select: { id: true, name: true, nit: true, phone: true, email: true },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const ranking = grouped.map((row) => ({
      customerId: row.customerId,
      customer: row.customerId ? customerMap.get(row.customerId) ?? null : null,
      totalAmount: Number(row._sum.total ?? 0),
      saleCount: row._count._all,
    }));

    return NextResponse.json({
      periodo: { desde: startDate, hasta: endDate },
      ranking,
    });
  } catch (error) {
    return handleApiError(error, '/api/reports/customers/top GET');
  }
}
