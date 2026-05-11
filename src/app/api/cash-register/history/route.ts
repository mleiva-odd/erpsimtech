import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireBranchAccess } from '@/lib/tenant';
import { handleApiError } from '@/lib/api-error';

/**
 * Histórico de turnos de caja cerrados.
 * Permite a managers/admins revisar cierres pasados, descuadres,
 * ventas por turno y reconciliar diferencias.
 *
 * Query params:
 * - branchId: filtrar por sucursal (default: respeta tenant.branchId)
 * - userId: filtrar por cajero específico
 * - from, to: rango de fechas (default: últimos 30 días)
 * - limit, offset: paginación (default 50, máx 200)
 */
export async function GET(req: NextRequest) {
  const result = await requireAnyPermission([
    'reports:view',
    'sales:view',
    'settings:manage',
  ]);
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const requestedBranchId = searchParams.get('branchId');
    const branchId =
      requestedBranchId && requestedBranchId !== 'all' && requestedBranchId !== 'null'
        ? requestedBranchId
        : null;
    const userId = searchParams.get('userId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const startDate = from
      ? new Date(from)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = to ? new Date(to) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const where: Prisma.CashRegisterWhereInput = {
      branch: { companyId: tenant.companyId },
      openedAt: { gte: startDate, lte: endDate },
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

    if (userId) {
      where.userId = userId;
    }

    const [registers, total] = await Promise.all([
      prisma.cashRegister.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { sales: true, transactions: true, customerPayments: true } },
        },
        orderBy: { openedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.cashRegister.count({ where }),
    ]);

    // Para cada turno calcular ventas totales (sólo COMPLETED) y CASH/CARD breakdown.
    const enriched = await Promise.all(
      registers.map(async (r) => {
        const salesAgg = await prisma.sale.aggregate({
          where: { cashRegisterId: r.id, status: 'COMPLETED' },
          _sum: { total: true },
          _count: { _all: true },
        });

        const payments = await prisma.payment.findMany({
          where: { sale: { cashRegisterId: r.id, status: 'COMPLETED' } },
          select: { method: true, amount: true },
        });
        const byMethod: Record<string, number> = {};
        for (const p of payments) {
          byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
        }

        const opening = Number(r.openingBalance);
        const closing = r.closingBalance != null ? Number(r.closingBalance) : null;

        return {
          id: r.id,
          status: r.status,
          openedAt: r.openedAt,
          closedAt: r.closedAt,
          openingBalance: opening,
          closingBalance: closing,
          branch: r.branch,
          user: r.user,
          sales: {
            count: salesAgg._count._all,
            total: Number(salesAgg._sum.total ?? 0),
            byMethod,
          },
          counts: r._count,
        };
      }),
    );

    return NextResponse.json({
      filtros: { branchId: where.branchId ?? null, userId: userId || null, desde: startDate, hasta: endDate },
      total,
      limit,
      offset,
      turnos: enriched,
    });
  } catch (error) {
    return handleApiError(error, '/api/cash-register/history GET');
  }
}
