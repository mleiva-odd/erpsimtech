import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireBranchAccess, requirePermission } from '@/lib/tenant';
import { handleApiError } from '@/lib/api-error';

/**
 * Top Suppliers — ranking de proveedores por monto comprado.
 * Permite negociar mejores condiciones y detectar dependencia
 * excesiva de un solo proveedor.
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

    const where: Prisma.PurchaseOrderWhereInput = {
      companyId: tenant.companyId,
      status: 'COMPLETED',
      createdAt: { gte: startDate, lte: endDate },
    };

    if (branchId) {
      const branchResult = await requireBranchAccess(tenant, branchId);
      if ('error' in branchResult) return branchResult.error;
      where.branchId = branchId;
    } else if (
      tenant.role !== 'SUPER_ADMIN' &&
      !tenant.permissions?.includes('settings:manage') &&
      tenant.branchId
    ) {
      where.branchId = tenant.branchId;
    }

    const grouped = await prisma.purchaseOrder.groupBy({
      by: ['supplierId'],
      where,
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    });

    const supplierIds = grouped.map((g) => g.supplierId);
    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds }, companyId: tenant.companyId },
      select: { id: true, name: true, nit: true, phone: true, email: true },
    });
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

    const ranking = grouped.map((row) => ({
      supplierId: row.supplierId,
      supplier: supplierMap.get(row.supplierId) ?? null,
      totalAmount: Number(row._sum.total ?? 0),
      purchaseCount: row._count._all,
    }));

    return NextResponse.json({
      periodo: { desde: startDate, hasta: endDate },
      ranking,
    });
  } catch (error) {
    return handleApiError(error, '/api/reports/suppliers/top GET');
  }
}
