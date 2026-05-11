import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission, requireBranchAccess } from '@/lib/tenant';
import { handleApiError } from '@/lib/api-error';

/**
 * Estado de Resultados (P&L) del período.
 *
 * Suma todos los AccountingEntry del rango y los agrupa por categoría:
 *  - Ingresos (INCOME)
 *  - Egresos (EXPENSE)
 *  - Utilidad neta = Ingresos − Egresos
 *
 * Incluye además:
 *  - Ventas brutas (Sale.total con status COMPLETED)
 *  - Costo de mercadería vendida (Σ saleItem.unitCost * quantity)
 *  - Margen bruto = ventas − COGS
 *
 * Esto le da al dueño una foto clara de rentabilidad sin tener
 * que armar reportes a mano en Excel.
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
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = to ? new Date(to) : new Date();
    endDate.setHours(23, 59, 59, 999);

    let scopedBranchId: string | null = null;
    if (branchId) {
      const branchResult = await requireBranchAccess(tenant, branchId);
      if ('error' in branchResult) return branchResult.error;
      scopedBranchId = branchId;
    } else if (
      tenant.role !== 'SUPER_ADMIN' &&
      !tenant.permissions?.includes('settings:manage') &&
      tenant.branchId
    ) {
      scopedBranchId = tenant.branchId;
    }

    const accountingWhere: Prisma.AccountingEntryWhereInput = {
      companyId: tenant.companyId,
      date: { gte: startDate, lte: endDate },
      ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
    };

    const grouped = await prisma.accountingEntry.groupBy({
      by: ['categoryId', 'type'],
      where: accountingWhere,
      _sum: { amount: true },
      _count: { _all: true },
    });

    const categoryIds = [...new Set(grouped.map((g) => g.categoryId))];
    const categories = await prisma.accountingCategory.findMany({
      where: { id: { in: categoryIds }, companyId: tenant.companyId },
      select: { id: true, name: true, type: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const ingresos: Array<{ categoryId: string; nombre: string; total: number; entries: number }> = [];
    const egresos: Array<{ categoryId: string; nombre: string; total: number; entries: number }> = [];
    let totalIngresos = 0;
    let totalEgresos = 0;

    for (const row of grouped) {
      const cat = categoryMap.get(row.categoryId);
      const total = Number(row._sum.amount ?? 0);
      const entry = {
        categoryId: row.categoryId,
        nombre: cat?.name ?? '(sin categoría)',
        total,
        entries: row._count._all,
      };
      if (row.type === 'INCOME') {
        ingresos.push(entry);
        totalIngresos += total;
      } else {
        egresos.push(entry);
        totalEgresos += total;
      }
    }
    ingresos.sort((a, b) => b.total - a.total);
    egresos.sort((a, b) => b.total - a.total);

    // Ventas brutas + COGS
    const saleWhere: Prisma.SaleWhereInput = {
      companyId: tenant.companyId,
      status: 'COMPLETED',
      createdAt: { gte: startDate, lte: endDate },
      ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
    };

    const ventasAgg = await prisma.sale.aggregate({
      where: saleWhere,
      _sum: { total: true, tax: true, discount: true },
      _count: { _all: true },
    });

    const cogsItems = await prisma.saleItem.findMany({
      where: { sale: saleWhere },
      select: { quantity: true, unitCost: true, subtotal: true },
    });
    const cogs = cogsItems.reduce(
      (acc, it) => acc + Number(it.unitCost ?? 0) * it.quantity,
      0,
    );
    const ventasBrutas = Number(ventasAgg._sum.total ?? 0);
    const ventasNetas = ventasBrutas - Number(ventasAgg._sum.tax ?? 0);
    const margenBruto = ventasNetas - cogs;

    return NextResponse.json({
      periodo: { desde: startDate, hasta: endDate, branchId: scopedBranchId },
      ventas: {
        brutas: ventasBrutas,
        impuestos: Number(ventasAgg._sum.tax ?? 0),
        descuentos: Number(ventasAgg._sum.discount ?? 0),
        netas: ventasNetas,
        cantidadVentas: ventasAgg._count._all,
      },
      cogs,
      margenBruto,
      margenBrutoPct: ventasNetas > 0 ? margenBruto / ventasNetas : 0,
      ingresos: {
        total: totalIngresos,
        porCategoria: ingresos,
      },
      egresos: {
        total: totalEgresos,
        porCategoria: egresos,
      },
      utilidadNeta: totalIngresos - totalEgresos,
    });
  } catch (error) {
    return handleApiError(error, '/api/reports/accounting/profit-loss GET');
  }
}
