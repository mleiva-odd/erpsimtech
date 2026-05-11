import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, requireBranchAccess } from '@/lib/tenant';
import { handleApiError } from '@/lib/api-error';

/**
 * Productos sin movimiento (slow movers).
 * Identifica productos con stock > 0 que no se han vendido en los
 * últimos N días. Permite tomar decisiones de descuento, devolución
 * a proveedor o discontinuación.
 *
 * Query params:
 * - days: ventana de "no movimiento" (default 60)
 * - branchId: filtrar por sucursal
 * - limit: máximo de resultados (default 50, máx 200)
 */
export async function GET(req: NextRequest) {
  const result = await requirePermission('reports:view');
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(parseInt(searchParams.get('days') || '60', 10), 365));
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const requestedBranchId = searchParams.get('branchId');
    const branchId =
      requestedBranchId && requestedBranchId !== 'all' && requestedBranchId !== 'null'
        ? requestedBranchId
        : null;

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

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    // Stock con cantidad > 0 dentro del scope
    const stocks = await prisma.productStock.findMany({
      where: {
        quantity: { gt: 0 },
        branch: { companyId: tenant.companyId },
        ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
      },
      include: {
        product: { select: { id: true, name: true, sku: true, price: true, cost: true, active: true } },
        variant: { select: { id: true, name: true, sku: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    // Identificar productos que SÍ se vendieron en la ventana
    // Buscamos por (productId, variantId) presentes en SaleItem dentro
    // del rango. Hacemos un set para lookup rápido.
    const productIds = [...new Set(stocks.map((s) => s.productId))];

    const movedItems = await prisma.saleItem.findMany({
      where: {
        productId: { in: productIds },
        sale: {
          companyId: tenant.companyId,
          status: 'COMPLETED',
          createdAt: { gte: cutoff },
          ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
        },
      },
      select: { productId: true, variantId: true },
    });
    const movedKey = new Set(movedItems.map((i) => `${i.productId}|${i.variantId ?? ''}`));

    const slow = stocks
      .filter((s) => !movedKey.has(`${s.productId}|${s.variantId ?? ''}`))
      .filter((s) => s.product.active)
      .map((s) => ({
        productId: s.productId,
        variantId: s.variantId,
        sku: s.variant?.sku || s.product.sku,
        name: s.product.name + (s.variant ? ` (${s.variant.name})` : ''),
        branch: s.branch,
        quantity: s.quantity,
        unitCost: Number(s.product.cost ?? 0),
        unitPrice: Number(s.product.price ?? 0),
        capitalAtRisk: Number(s.product.cost ?? 0) * s.quantity,
      }))
      .sort((a, b) => b.capitalAtRisk - a.capitalAtRisk)
      .slice(0, limit);

    const totalCapitalAtRisk = slow.reduce((acc, s) => acc + s.capitalAtRisk, 0);

    return NextResponse.json({
      filtros: { ventanaDias: days, branchId: scopedBranchId, desde: cutoff },
      resumen: {
        productos: slow.length,
        capitalAtRisk: totalCapitalAtRisk,
      },
      productos: slow,
    });
  } catch (error) {
    return handleApiError(error, '/api/reports/inventory/slow-movers GET');
  }
}
